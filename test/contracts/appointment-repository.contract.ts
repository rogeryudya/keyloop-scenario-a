import { randomUUID } from 'node:crypto';
import { AppointmentStatus } from '../../src/modules/appointments/domain/appointment-status';
import { Appointment } from '../../src/modules/appointments/domain/appointment.entity';
import { AppointmentConflictError } from '../../src/modules/appointments/domain/appointment.errors';
import { AppointmentRepository } from '../../src/modules/appointments/domain/appointment.repository';
import { TimeSlot } from '../../src/shared/domain/time-slot';

// Ids from prisma/seed/data.json, so the Prisma adapter's FKs are satisfied. Anong and Boonsong are
// Bangkok technicians qualified for OIL_CHANGE.
const BANGKOK = '10000000-0000-4000-8000-000000000001';
const HCMC = '10000000-0000-4000-8000-000000000002';
const BAY_1 = '20000000-0000-4000-8000-000000000101';
const BAY_2 = '20000000-0000-4000-8000-000000000102';
const HCMC_BAY_A = '20000000-0000-4000-8000-000000000201';
const ANONG = '30000000-0000-4000-8000-000000000101';
const BOONSONG = '30000000-0000-4000-8000-000000000102';
const NGUYEN = '30000000-0000-4000-8000-000000000201';
const OIL_CHANGE = '40000000-0000-4000-8000-000000000001';
const SOMSAK = {
  customerId: '50000000-0000-4000-8000-000000000001',
  vehicleId: '60000000-0000-4000-8000-000000000001',
};
const LAN = {
  customerId: '50000000-0000-4000-8000-000000000004',
  vehicleId: '60000000-0000-4000-8000-000000000005',
};

const BOOKED_AT = new Date('2030-01-01T00:00:00.000Z');

/** Built with `restore`: these tests place slots at day edges, outside opening hours on purpose. */
const anAppointment = (input: {
  start: string;
  minutes?: number;
  bay?: string;
  technician?: string;
  dealership?: string;
  who?: typeof SOMSAK;
}): Appointment =>
  Appointment.restore({
    id: randomUUID(),
    dealershipId: input.dealership ?? BANGKOK,
    serviceBayId: input.bay ?? BAY_1,
    technicianId: input.technician ?? ANONG,
    serviceTypeId: OIL_CHANGE,
    ...(input.who ?? SOMSAK),
    slot: TimeSlot.fromStartAndDuration(new Date(input.start), input.minutes ?? 60),
    status: AppointmentStatus.Confirmed,
    createdAt: BOOKED_AT,
    cancelledAt: null,
  });

/**
 * Behaviour every AppointmentRepository must share, run against the Prisma adapter (int) and the
 * in-memory fake (unit) so handler tests can trust the fake.
 * @param make returns a repository with no appointments; called before each test
 */
export function appointmentRepositoryContract(make: () => Promise<AppointmentRepository>): void {
  let repository: AppointmentRepository;

  beforeEach(async () => {
    repository = await make();
  });

  describe('save and findById', () => {
    it('stores a new appointment and loads it back unchanged', async () => {
      const appointment = anAppointment({ start: '2030-01-15T03:00:00.000Z' });

      await repository.save(appointment);

      const loaded = await repository.findById(appointment.id);
      expect(loaded?.toSnapshot()).toEqual(appointment.toSnapshot());
    });

    it('returns null for an unknown id', async () => {
      await expect(repository.findById(randomUUID())).resolves.toBeNull();
    });

    it('updates the status of an existing appointment', async () => {
      const appointment = anAppointment({ start: '2030-01-15T03:00:00.000Z' });
      await repository.save(appointment);
      const cancelledAt = new Date('2030-01-02T00:00:00.000Z');

      appointment.cancel(cancelledAt);
      await repository.save(appointment);

      const loaded = await repository.findById(appointment.id);
      expect(loaded?.status).toBe(AppointmentStatus.Cancelled);
      expect(loaded?.toSnapshot().cancelledAt).toEqual(cancelledAt);
    });

    it('is not affected by changes to the entity after saving', async () => {
      const appointment = anAppointment({ start: '2030-01-15T03:00:00.000Z' });
      await repository.save(appointment);

      appointment.cancel(BOOKED_AT);

      expect((await repository.findById(appointment.id))?.status).toBe(AppointmentStatus.Confirmed);
    });
  });

  describe('Idempotency-Key (FR-11)', () => {
    const stamped = (key: string, start = '2030-01-15T03:00:00.000Z', bay = BAY_1) =>
      Appointment.restore({
        ...anAppointment({ start, bay }).toSnapshot(),
        idempotency: { key, requestHash: 'a'.repeat(64) },
      });

    it('stores the key and hash and finds the appointment by key', async () => {
      const appointment = stamped('k-1');
      await repository.save(appointment);

      const found = await repository.findByIdempotencyKey('k-1');

      expect(found?.toSnapshot()).toEqual(appointment.toSnapshot());
    });

    it('returns null for an unknown key; keys are case-sensitive', async () => {
      await repository.save(stamped('Key'));

      await expect(repository.findByIdempotencyKey('key')).resolves.toBeNull();
    });

    it('keeps the key when the appointment is cancelled', async () => {
      const appointment = stamped('k-1');
      await repository.save(appointment);
      appointment.cancel(BOOKED_AT);
      await repository.save(appointment);

      expect((await repository.findByIdempotencyKey('k-1'))?.status).toBe(
        AppointmentStatus.Cancelled,
      );
    });

    it('rejects a second appointment with the same key as a lost race (retryable)', async () => {
      await repository.save(stamped('k-1'));

      await expect(
        repository.save(stamped('k-1', '2030-01-16T03:00:00.000Z', BAY_2)),
      ).rejects.toThrow(AppointmentConflictError);
    });
  });

  describe('findConfirmedOverlapping', () => {
    const requested = TimeSlot.of(
      new Date('2030-01-15T03:00:00.000Z'),
      new Date('2030-01-15T04:00:00.000Z'),
    );

    it('returns confirmed appointments of the dealership that overlap, ordered by start', async () => {
      const later = anAppointment({ start: '2030-01-15T03:59:00.000Z', bay: BAY_2 });
      const earlier = anAppointment({ start: '2030-01-15T02:30:00.000Z', technician: BOONSONG });
      await repository.save(later);
      await repository.save(earlier);

      const found = await repository.findConfirmedOverlapping(BANGKOK, requested);

      expect(found.map((a) => a.id)).toEqual([earlier.id, later.id]);
    });

    it('excludes back-to-back appointments (BR-2)', async () => {
      await repository.save(anAppointment({ start: '2030-01-15T02:00:00.000Z' }));
      await repository.save(anAppointment({ start: '2030-01-15T04:00:00.000Z' }));

      await expect(repository.findConfirmedOverlapping(BANGKOK, requested)).resolves.toEqual([]);
    });

    it('excludes cancelled appointments (BR-9)', async () => {
      const appointment = anAppointment({ start: '2030-01-15T03:00:00.000Z' });
      appointment.cancel(BOOKED_AT);
      await repository.save(appointment);

      await expect(repository.findConfirmedOverlapping(BANGKOK, requested)).resolves.toEqual([]);
    });

    it('excludes appointments of another dealership', async () => {
      await repository.save(
        anAppointment({
          start: '2030-01-15T03:00:00.000Z',
          dealership: HCMC,
          bay: HCMC_BAY_A,
          technician: NGUYEN,
          who: LAN,
        }),
      );

      await expect(repository.findConfirmedOverlapping(BANGKOK, requested)).resolves.toEqual([]);
    });
  });

  describe('countForTechniciansOnDay', () => {
    it('counts confirmed appointments starting on the local day (Asia/Bangkok, UTC+7)', async () => {
      // Local day 2030-01-15 in Bangkok = [2030-01-14T17:00Z, 2030-01-15T17:00Z).
      await repository.save(anAppointment({ start: '2030-01-14T17:00:00.000Z' })); // 00:00 local
      await repository.save(anAppointment({ start: '2030-01-15T16:30:00.000Z', minutes: 30 })); // 23:30
      await repository.save(anAppointment({ start: '2030-01-14T16:00:00.000Z' })); // previous day
      await repository.save(anAppointment({ start: '2030-01-15T17:00:00.000Z' })); // next day
      await repository.save(
        anAppointment({ start: '2030-01-15T03:00:00.000Z', technician: BOONSONG }),
      );
      const cancelled = anAppointment({ start: '2030-01-15T05:00:00.000Z', technician: BOONSONG });
      cancelled.cancel(BOOKED_AT);
      await repository.save(cancelled);

      const counts = await repository.countForTechniciansOnDay(
        [ANONG, BOONSONG],
        new Date('2030-01-15T03:00:00.000Z'),
        'Asia/Bangkok',
      );

      expect(counts).toEqual(
        new Map([
          [ANONG, 2],
          [BOONSONG, 1],
        ]),
      );
    });

    it('uses the zone rules on a DST day (Europe/London, 23-hour day)', async () => {
      // 2030-03-31 is the spring-forward day in London: local day = [00:00Z, 23:00Z).
      await repository.save(anAppointment({ start: '2030-03-31T22:00:00.000Z' })); // 23:00 BST
      await repository.save(anAppointment({ start: '2030-03-31T23:00:00.000Z' })); // 00:00 next day

      const counts = await repository.countForTechniciansOnDay(
        [ANONG],
        new Date('2030-03-31T12:00:00.000Z'),
        'Europe/London',
      );

      expect(counts).toEqual(new Map([[ANONG, 1]]));
    });

    it('omits technicians with no appointments and only counts the requested ones', async () => {
      await repository.save(anAppointment({ start: '2030-01-15T03:00:00.000Z' }));

      const counts = await repository.countForTechniciansOnDay(
        [BOONSONG],
        new Date('2030-01-15T03:00:00.000Z'),
        'Asia/Bangkok',
      );

      expect(counts).toEqual(new Map());
    });

    it('returns an empty map for no technicians', async () => {
      await expect(
        repository.countForTechniciansOnDay([], new Date(), 'Asia/Bangkok'),
      ).resolves.toEqual(new Map());
    });
  });
}
