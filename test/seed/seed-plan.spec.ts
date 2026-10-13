import data from '../../prisma/seed/data.json';
import {
  SeedData,
  SeedValidationError,
  buildSeedPlan,
  localDateOf,
  zonedToUtc,
} from '../../prisma/seed/seed-plan';

// 2026-10-12 20:00 UTC is already 2026-10-13 03:00 in Bangkok / Ho Chi Minh City (UTC+7).
const NOW = new Date('2026-10-12T20:00:00.000Z');

const withAppointment = (changes: Partial<SeedData['demoAppointments'][number]>): SeedData => {
  const [first, ...rest] = data.demoAppointments;
  if (!first) throw new Error('data.json has demo appointments');
  return { ...data, demoAppointments: [{ ...first, ...changes }, ...rest] };
};

const problemsOf = (input: SeedData): readonly string[] => {
  try {
    buildSeedPlan(input, NOW);
  } catch (error) {
    if (error instanceof SeedValidationError) return error.problems;
    throw error;
  }
  return [];
};

describe('buildSeedPlan', () => {
  it('accepts the shipped data.json', () => {
    const plan = buildSeedPlan(data, NOW);

    expect(plan.dealerships).toHaveLength(6);
    expect(plan.serviceBays).toHaveLength(12);
    expect(plan.technicians).toHaveLength(18);
    expect(plan.appointments).toHaveLength(24);
  });

  it('resolves qualification codes to service type ids', () => {
    const plan = buildSeedPlan(data, NOW);

    expect(plan.qualifications).toContainEqual({
      technicianId: '30000000-0000-4000-8000-000000000104',
      serviceTypeId: '40000000-0000-4000-8000-000000000007', // TRANSMISSION_REPAIR
    });
    expect(plan.qualifications).toHaveLength(54);
  });

  it('stores opening hours as time-of-day values', () => {
    const [bangkok] = buildSeedPlan(data, NOW).dealerships;

    expect(bangkok?.opensAt.toISOString()).toBe('1970-01-01T08:00:00.000Z');
    expect(bangkok?.closesAt.toISOString()).toBe('1970-01-01T18:00:00.000Z');
  });

  it('places demo appointments on "tomorrow" in the dealership time zone, end = start + duration', () => {
    const plan = buildSeedPlan(data, NOW);

    // Local today is 2026-10-13, so tomorrow is 2026-10-14. Hanoi 10:00 (UTC+7) = 03:00Z, OIL_CHANGE 30 min.
    expect(plan.appointments[0]).toMatchObject({
      startAt: new Date('2026-10-14T03:00:00.000Z'),
      endAt: new Date('2026-10-14T03:30:00.000Z'),
      serviceTypeId: '40000000-0000-4000-8000-000000000001',
      status: 'CONFIRMED',
      cancelledAt: null,
    });
    // Bangkok 09:00 = 02:00Z, BRAKE_SERVICE 90 min.
    expect(plan.appointments[1]).toMatchObject({
      startAt: new Date('2026-10-14T02:00:00.000Z'),
      endAt: new Date('2026-10-14T03:30:00.000Z'),
    });
  });

  it('marks a cancelled demo appointment with cancelledAt', () => {
    expect(buildSeedPlan(data, NOW).appointments[2]).toMatchObject({
      status: 'CANCELLED',
      cancelledAt: NOW,
    });
  });

  it.each([
    [
      'an unknown dealership',
      { dealershipId: '10000000-0000-4000-8000-000000000099' },
      'unknown dealership',
    ],
    [
      'an unknown service type code',
      { serviceTypeCode: 'CAR_WASH' },
      'unknown service type code CAR_WASH',
    ],
    [
      'a bay of another dealership',
      { serviceBayId: '20000000-0000-4000-8000-000000000101' },
      'service bay belongs to another dealership',
    ],
    [
      'a technician of another dealership',
      { technicianId: '30000000-0000-4000-8000-000000000101' },
      'technician belongs to another dealership',
    ],
    [
      'an unqualified technician',
      { serviceTypeCode: 'BRAKE_SERVICE' },
      'not qualified for BRAKE_SERVICE',
    ],
    [
      'a vehicle of another customer',
      { vehicleId: '60000000-0000-4000-8000-000000000001' },
      'vehicle is not owned by the customer',
    ],
    [
      'an unknown customer',
      { customerId: '50000000-0000-4000-8000-000000000099' },
      'unknown customer',
    ],
    ['an unknown status', { status: 'PENDING' }, 'unknown status PENDING'],
    ['a malformed local start', { localStart: '9:00' }, 'localStart must be HH:mm'],
    [
      'a start before opening (Hanoi opens 09:00)',
      { localStart: '08:45' },
      'outside opening hours',
    ],
    ['an end after closing (Hanoi closes 17:00)', { localStart: '16:45' }, 'outside opening hours'],
  ])('rejects a demo appointment with %s', (_case, changes, problem) => {
    expect(problemsOf(withAppointment(changes))).toContainEqual(expect.stringContaining(problem));
  });

  it('accepts a demo appointment ending exactly at closing time', () => {
    expect(problemsOf(withAppointment({ localStart: '16:30' }))).toEqual([]);
  });

  it('rejects invalid opening hours and unknown references in reference data', () => {
    const [first, ...rest] = data.dealerships;
    const [vehicle] = data.vehicles;
    if (!first || !vehicle) throw new Error('data.json has dealerships and vehicles');
    const problems = problemsOf({
      ...data,
      dealerships: [{ ...first, timeZone: 'Mars/Base' }, ...rest],
      technicians: [
        ...data.technicians,
        { id: 't-x', dealershipId: 'd-x', name: 'X', qualifications: ['CAR_WASH'] },
      ],
      vehicles: [...data.vehicles, { ...vehicle, id: 'v-x', customerId: 'c-x' }],
    });

    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^dealership 10000000-0000-4000-8000-000000000001: .*timeZone/),
        'technician t-x: unknown dealership d-x',
        'technician t-x: unknown service type code CAR_WASH',
        'vehicle v-x: unknown customer c-x',
      ]),
    );
  });

  it('reports every problem at once', () => {
    const error = (() => {
      try {
        buildSeedPlan(withAppointment({ customerId: 'c-x', status: 'PENDING' }), NOW);
      } catch (e) {
        return e;
      }
      return undefined;
    })();

    expect(error).toBeInstanceOf(SeedValidationError);
    expect((error as SeedValidationError).problems).toHaveLength(3); // unknown customer, vehicle owner, status
  });
});

describe('time zone helpers', () => {
  it('gives the local calendar date', () => {
    expect(localDateOf(NOW, 'Asia/Bangkok')).toBe('2026-10-13');
    expect(localDateOf(NOW, 'UTC')).toBe('2026-10-12');
  });

  it('converts a local wall-clock time to UTC in a fixed-offset zone', () => {
    expect(zonedToUtc('2026-10-14', '10:00', 'Asia/Ho_Chi_Minh')).toEqual(
      new Date('2026-10-14T03:00:00.000Z'),
    );
  });

  it.each([
    ['before clocks go forward (GMT)', '2026-03-28', '09:00', '2026-03-28T09:00:00.000Z'],
    ['on the day clocks go forward (BST)', '2026-03-29', '09:00', '2026-03-29T08:00:00.000Z'],
    ['just after the change at 02:00 BST', '2026-03-29', '02:00', '2026-03-29T01:00:00.000Z'],
    ['on the day clocks go back (GMT)', '2026-10-25', '09:00', '2026-10-25T09:00:00.000Z'],
  ])('converts across DST in Europe/London: %s', (_case, date, time, expected) => {
    expect(zonedToUtc(date, time, 'Europe/London')).toEqual(new Date(expected));
  });
});
