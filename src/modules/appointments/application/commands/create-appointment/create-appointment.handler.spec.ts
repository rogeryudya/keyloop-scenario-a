import { randomUUID } from 'node:crypto';
import { FixedClock } from '../../../../../../test/fakes/fixed-clock';
import { InMemoryAppointmentRepository } from '../../../../../../test/fakes/in-memory-appointment-repository';
import { InMemoryBookableResources } from '../../../../../../test/fakes/in-memory-bookable-resources';
import { InMemoryBookingParties } from '../../../../../../test/fakes/in-memory-booking-parties';
import { useNoOpTransactions } from '../../../../../../test/helpers/transactions';
import { OpeningHours } from '../../../../../shared/domain/opening-hours';
import { TimeSlot } from '../../../../../shared/domain/time-slot';
import { AppointmentStatus } from '../../../domain/appointment-status';
import { Appointment } from '../../../domain/appointment.entity';
import { CreateAppointmentCommand } from './create-appointment.command';
import { CreateAppointmentHandler } from './create-appointment.handler';

// Bangkok (UTC+7), open 08:00–18:00 local = 01:00Z–11:00Z.
const BANGKOK = 'd0000000-0000-4000-8000-000000000001';
const HANOI = 'd0000000-0000-4000-8000-000000000002';
const OIL_CHANGE = 's0000000-0000-4000-8000-000000000001'; // 30 min
const TRANSMISSION = 's0000000-0000-4000-8000-000000000002'; // nobody qualified
const BAY_1 = 'b0000000-0000-4000-8000-000000000001';
const BAY_2 = 'b0000000-0000-4000-8000-000000000002';
const ANONG = 't0000000-0000-4000-8000-000000000001';
const BOONSONG = 't0000000-0000-4000-8000-000000000002';
const SOMSAK = 'c0000000-0000-4000-8000-000000000001';
const MALEE = 'c0000000-0000-4000-8000-000000000002';
const SOMSAK_CAR = 'v0000000-0000-4000-8000-000000000001';
const MALEE_CAR = 'v0000000-0000-4000-8000-000000000002';
const UNKNOWN = 'f0000000-0000-4000-8000-000000000000';

const NOW = '2026-10-12T03:00:00.000Z';
const TOMORROW_10AM = new Date('2026-10-13T03:00:00.000Z'); // 10:00 local

const bangkokHours = OpeningHours.of({
  opensAt: '08:00',
  closesAt: '18:00',
  timeZone: 'Asia/Bangkok',
});

const existing = (input: { bay: string; technician: string; start: Date; minutes?: number }) =>
  Appointment.restore({
    id: randomUUID(),
    dealershipId: BANGKOK,
    serviceBayId: input.bay,
    technicianId: input.technician,
    serviceTypeId: OIL_CHANGE,
    customerId: MALEE,
    vehicleId: MALEE_CAR,
    slot: TimeSlot.fromStartAndDuration(input.start, input.minutes ?? 30),
    status: AppointmentStatus.Confirmed,
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    cancelledAt: null,
  });

describe('CreateAppointmentHandler', () => {
  let closeTransactions: () => Promise<void>;
  let appointments: InMemoryAppointmentRepository;
  let handler: CreateAppointmentHandler;

  const setup = (
    options: { existing?: Appointment[]; bays?: string[]; technicians?: string[] } = {},
  ) => {
    appointments = new InMemoryAppointmentRepository(options.existing);
    const resources = new InMemoryBookableResources({
      dealerships: [
        { id: BANGKOK, openingHours: bangkokHours },
        { id: HANOI, openingHours: bangkokHours },
      ],
      serviceTypes: [
        { id: OIL_CHANGE, durationMinutes: 30 },
        { id: TRANSMISSION, durationMinutes: 240 },
      ],
      bays: (options.bays ?? [BAY_1, BAY_2]).map((id) => ({ id, dealershipId: BANGKOK })),
      technicians: (options.technicians ?? [ANONG, BOONSONG]).map((id) => ({
        id,
        dealershipId: BANGKOK,
        serviceTypeIds: [OIL_CHANGE],
      })),
    });
    const parties = new InMemoryBookingParties(
      [SOMSAK, MALEE],
      new Map([
        [SOMSAK_CAR, SOMSAK],
        [MALEE_CAR, MALEE],
      ]),
    );
    handler = new CreateAppointmentHandler(appointments, resources, parties, new FixedClock(NOW));
  };

  const command = (overrides: Partial<CreateAppointmentCommand> = {}): CreateAppointmentCommand => {
    const c = {
      customerId: SOMSAK,
      vehicleId: SOMSAK_CAR,
      dealershipId: BANGKOK,
      serviceTypeId: OIL_CHANGE,
      start: TOMORROW_10AM,
      ...overrides,
    };
    return new CreateAppointmentCommand(
      c.customerId,
      c.vehicleId,
      c.dealershipId,
      c.serviceTypeId,
      c.start,
    );
  };

  const rejection = (cmd: CreateAppointmentCommand) =>
    handler.execute(cmd).catch((e: unknown) => e);

  beforeAll(async () => {
    closeTransactions = await useNoOpTransactions();
  });

  afterAll(async () => {
    await closeTransactions();
  });

  beforeEach(() => setup());

  describe('success (FR-1, FR-3)', () => {
    it('persists a confirmed appointment and returns its id', async () => {
      const { id } = await handler.execute(command());

      const saved = await appointments.findById(id);
      expect(saved?.status).toBe(AppointmentStatus.Confirmed);
      expect(saved?.toSnapshot()).toMatchObject({
        dealershipId: BANGKOK,
        serviceTypeId: OIL_CHANGE,
        customerId: SOMSAK,
        vehicleId: SOMSAK_CAR,
        serviceBayId: BAY_1,
        technicianId: ANONG,
        createdAt: new Date(NOW),
      });
    });

    it('sets end = start + service duration (BR-1)', async () => {
      const { id } = await handler.execute(command());

      const saved = await appointments.findById(id);
      expect(saved?.slot.end).toEqual(new Date('2026-10-13T03:30:00.000Z'));
    });

    it('allocates around busy resources (FR-2)', async () => {
      setup({ existing: [existing({ bay: BAY_1, technician: ANONG, start: TOMORROW_10AM })] });

      const { id } = await handler.execute(command());

      expect((await appointments.findById(id))?.toSnapshot()).toMatchObject({
        serviceBayId: BAY_2,
        technicianId: BOONSONG,
      });
    });

    it('prefers the technician with fewer appointments that day (BR-11)', async () => {
      setup({
        existing: [
          existing({ bay: BAY_1, technician: ANONG, start: new Date('2026-10-13T01:00:00.000Z') }),
        ],
      });

      const { id } = await handler.execute(command());

      expect((await appointments.findById(id))?.toSnapshot().technicianId).toBe(BOONSONG);
    });
  });

  describe('referenced records (BR-13)', () => {
    it.each([
      ['dealership', { dealershipId: UNKNOWN }, 'DEALERSHIP_NOT_FOUND', 'dealershipId'],
      ['service type', { serviceTypeId: UNKNOWN }, 'SERVICE_TYPE_NOT_FOUND', 'serviceTypeId'],
      ['customer', { customerId: UNKNOWN }, 'CUSTOMER_NOT_FOUND', 'customerId'],
      ['vehicle', { vehicleId: UNKNOWN }, 'VEHICLE_NOT_FOUND', 'vehicleId'],
    ])('rejects an unknown %s', async (_what, overrides, code, field) => {
      expect(await rejection(command(overrides))).toMatchObject({
        code,
        details: [{ field }],
      });
      expect(appointments.all).toEqual([]);
    });
  });

  describe('business rules', () => {
    it("rejects someone else's vehicle (BR-5)", async () => {
      expect(await rejection(command({ vehicleId: MALEE_CAR }))).toMatchObject({
        code: 'VEHICLE_NOT_OWNED_BY_CUSTOMER',
      });
    });

    it('rejects a start in the past (BR-3)', async () => {
      const start = new Date('2026-10-12T02:00:00.000Z');

      expect(await rejection(command({ start }))).toMatchObject({ code: 'APPOINTMENT_IN_PAST' });
    });

    it('rejects a start equal to now (BR-3 boundary)', async () => {
      expect(await rejection(command({ start: new Date(NOW) }))).toMatchObject({
        code: 'APPOINTMENT_IN_PAST',
      });
    });

    it('rejects a slot running past closing time (BR-4)', async () => {
      const start = new Date('2026-10-13T10:45:00.000Z'); // 17:45–18:15 local

      expect(await rejection(command({ start }))).toMatchObject({ code: 'OUTSIDE_OPENING_HOURS' });
    });

    it('rejects a service type nobody at the dealership is qualified for (BR-6)', async () => {
      const start = new Date('2026-10-13T01:00:00.000Z');

      expect(await rejection(command({ serviceTypeId: TRANSMISSION, start }))).toMatchObject({
        code: 'SERVICE_TYPE_NOT_SUPPORTED',
      });
    });

    it('rejects when every bay is busy (BR-7)', async () => {
      setup({
        bays: [BAY_1],
        existing: [existing({ bay: BAY_1, technician: ANONG, start: TOMORROW_10AM })],
      });

      expect(await rejection(command())).toMatchObject({ code: 'NO_SERVICE_BAY_AVAILABLE' });
    });

    it('rejects when every qualified technician is busy (BR-8)', async () => {
      setup({
        technicians: [ANONG],
        existing: [existing({ bay: BAY_1, technician: ANONG, start: TOMORROW_10AM })],
      });

      expect(await rejection(command())).toMatchObject({ code: 'NO_TECHNICIAN_AVAILABLE' });
    });

    it('ignores a cancelled appointment in the slot (BR-9)', async () => {
      const cancelled = existing({ bay: BAY_1, technician: ANONG, start: TOMORROW_10AM });
      cancelled.cancel(new Date(NOW));
      setup({ bays: [BAY_1], technicians: [ANONG], existing: [cancelled] });

      const { id } = await handler.execute(command());

      expect((await appointments.findById(id))?.toSnapshot()).toMatchObject({
        serviceBayId: BAY_1,
        technicianId: ANONG,
      });
    });

    it('books back-to-back with an existing appointment (BR-2)', async () => {
      setup({
        bays: [BAY_1],
        technicians: [ANONG],
        existing: [
          existing({ bay: BAY_1, technician: ANONG, start: new Date('2026-10-13T02:30:00.000Z') }),
        ],
      });

      await expect(handler.execute(command())).resolves.toHaveProperty('id');
    });
  });

  describe('check order', () => {
    it('reports a missing dealership before anything else', async () => {
      const cmd = command({ dealershipId: UNKNOWN, customerId: UNKNOWN, start: new Date(0) });

      expect(await rejection(cmd)).toMatchObject({ code: 'DEALERSHIP_NOT_FOUND' });
    });

    it('reports vehicle ownership before the time rules', async () => {
      const cmd = command({ vehicleId: MALEE_CAR, start: new Date(0) });

      expect(await rejection(cmd)).toMatchObject({ code: 'VEHICLE_NOT_OWNED_BY_CUSTOMER' });
    });

    it('reports opening hours before resource availability', async () => {
      setup({
        bays: [BAY_1],
        existing: [
          existing({ bay: BAY_1, technician: ANONG, start: new Date('2026-10-13T10:45:00.000Z') }),
        ],
      });
      const start = new Date('2026-10-13T10:45:00.000Z');

      expect(await rejection(command({ start }))).toMatchObject({ code: 'OUTSIDE_OPENING_HOURS' });
    });
  });
});
