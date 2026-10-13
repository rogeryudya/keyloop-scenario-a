import {
  BookedAppointment,
  findDoubleBookings,
  percentile,
} from '../../scripts/load/booking-load-check';

const appointment = (
  id: string,
  start: string,
  end: string,
  overrides: Partial<BookedAppointment> = {},
): BookedAppointment => ({
  id,
  status: 'CONFIRMED',
  start: `2030-01-15T${start}:00.000Z`,
  end: `2030-01-15T${end}:00.000Z`,
  serviceBay: { id: `bay-${id}` },
  technician: { id: `tech-${id}` },
  ...overrides,
});

describe('percentile', () => {
  const samples = [5, 1, 4, 2, 3, 10, 9, 8, 7, 6];

  it.each([
    [50, 5],
    [90, 9],
    [95, 10],
    [100, 10],
    [0, 1],
  ])('p%i = %i (nearest rank, unsorted input)', (p, expected) => {
    expect(percentile(samples, p)).toBe(expected);
  });

  it('is NaN without samples', () => {
    expect(percentile([], 50)).toBeNaN();
  });
});

describe('findDoubleBookings', () => {
  const sharedBay = { serviceBay: { id: 'bay-1' } };

  it('finds two confirmed appointments overlapping on the same bay', () => {
    const found = findDoubleBookings([
      appointment('a', '03:00', '03:30', sharedBay),
      appointment('b', '03:15', '03:45', sharedBay),
    ]);

    expect(found).toEqual([
      { resource: 'serviceBay', resourceId: 'bay-1', appointmentIds: ['a', 'b'] },
    ]);
  });

  it('finds an overlap on the same technician', () => {
    const tech = { technician: { id: 'tech-1' } };

    expect(
      findDoubleBookings([
        appointment('a', '03:00', '04:00', tech),
        appointment('b', '03:30', '03:45', tech),
      ]),
    ).toEqual([{ resource: 'technician', resourceId: 'tech-1', appointmentIds: ['a', 'b'] }]);
  });

  it('allows back-to-back on the same resource (BR-2)', () => {
    expect(
      findDoubleBookings([
        appointment('a', '03:00', '03:30', sharedBay),
        appointment('b', '03:30', '04:00', sharedBay),
      ]),
    ).toEqual([]);
  });

  it('ignores cancelled appointments (BR-9)', () => {
    expect(
      findDoubleBookings([
        appointment('a', '03:00', '03:30', sharedBay),
        appointment('b', '03:00', '03:30', { ...sharedBay, status: 'CANCELLED' }),
      ]),
    ).toEqual([]);
  });

  it('finds an overlap with a non-adjacent earlier appointment', () => {
    const found = findDoubleBookings([
      appointment('long', '03:00', '05:00', sharedBay),
      appointment('x', '03:10', '03:20', { serviceBay: { id: 'bay-2' } }),
      appointment('late', '04:30', '05:30', sharedBay),
    ]);

    expect(found.map((d) => d.appointmentIds)).toEqual([['long', 'late']]);
  });

  it('allows the same time on different resources', () => {
    expect(
      findDoubleBookings([appointment('a', '03:00', '03:30'), appointment('b', '03:00', '03:30')]),
    ).toEqual([]);
  });
});
