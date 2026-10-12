import { InvalidTimeSlotError, TimeSlot } from '../../../shared/domain/time-slot';
import { AppointmentStatus } from './appointment-status';
import { Appointment, CreateAppointmentInput } from './appointment.entity';
import { AppointmentInPastError, AppointmentNotCancellableError } from './appointment.errors';

const NOW = new Date('2026-10-12T10:00:00.000Z');
const TOMORROW_9AM = new Date('2026-10-13T02:00:00.000Z');

const createInput = (overrides: Partial<CreateAppointmentInput> = {}): CreateAppointmentInput => ({
  id: 'a0000000-0000-4000-8000-000000000001',
  dealershipId: 'd0000000-0000-4000-8000-000000000001',
  serviceBayId: 'b0000000-0000-4000-8000-000000000001',
  technicianId: 't0000000-0000-4000-8000-000000000001',
  serviceTypeId: 's0000000-0000-4000-8000-000000000001',
  customerId: 'c0000000-0000-4000-8000-000000000001',
  vehicleId: 'v0000000-0000-4000-8000-000000000001',
  start: TOMORROW_9AM,
  durationMinutes: 60,
  now: NOW,
  ...overrides,
});

describe('Appointment', () => {
  describe('create', () => {
    it('creates a confirmed appointment with the given references', () => {
      const appointment = Appointment.create(createInput());

      expect(appointment.status).toBe(AppointmentStatus.Confirmed);
      expect(appointment.toSnapshot()).toMatchObject({
        id: 'a0000000-0000-4000-8000-000000000001',
        dealershipId: 'd0000000-0000-4000-8000-000000000001',
        serviceBayId: 'b0000000-0000-4000-8000-000000000001',
        technicianId: 't0000000-0000-4000-8000-000000000001',
        serviceTypeId: 's0000000-0000-4000-8000-000000000001',
        customerId: 'c0000000-0000-4000-8000-000000000001',
        vehicleId: 'v0000000-0000-4000-8000-000000000001',
        createdAt: NOW,
        cancelledAt: null,
      });
    });

    it('sets end = start + service duration (BR-1)', () => {
      const appointment = Appointment.create(createInput({ durationMinutes: 90 }));

      expect(appointment.slot.start).toEqual(TOMORROW_9AM);
      expect(appointment.slot.end).toEqual(new Date('2026-10-13T03:30:00.000Z'));
    });

    it('accepts a start one millisecond after now (BR-3 boundary)', () => {
      const start = new Date(NOW.getTime() + 1);

      expect(Appointment.create(createInput({ start })).slot.start).toEqual(start);
    });

    it('rejects a start equal to now (BR-3)', () => {
      expect(() => Appointment.create(createInput({ start: NOW }))).toThrow(AppointmentInPastError);
    });

    it('rejects a start in the past (BR-3)', () => {
      const start = new Date('2026-10-12T09:00:00.000Z');

      expect(() => Appointment.create(createInput({ start }))).toThrow(AppointmentInPastError);
    });

    it('reports APPOINTMENT_IN_PAST on the start field', () => {
      expect(new AppointmentInPastError()).toMatchObject({
        code: 'APPOINTMENT_IN_PAST',
        details: [{ field: 'start' }],
      });
    });

    it.each([0, -15])('rejects a non-positive duration of %p minutes', (durationMinutes) => {
      expect(() => Appointment.create(createInput({ durationMinutes }))).toThrow(
        InvalidTimeSlotError,
      );
    });

    it('is not affected by later changes to the given now', () => {
      const now = new Date(NOW.getTime());
      const appointment = Appointment.create(createInput({ now }));

      now.setUTCFullYear(2000);

      expect(appointment.toSnapshot().createdAt).toEqual(NOW);
    });
  });

  describe('cancel', () => {
    const cancelAt = new Date('2026-10-12T11:00:00.000Z');

    it('cancels a confirmed appointment and records when', () => {
      const appointment = Appointment.create(createInput());

      appointment.cancel(cancelAt);

      expect(appointment.status).toBe(AppointmentStatus.Cancelled);
      expect(appointment.toSnapshot().cancelledAt).toEqual(cancelAt);
    });

    it('keeps the slot and references when cancelled', () => {
      const appointment = Appointment.create(createInput());
      const before = appointment.toSnapshot();

      appointment.cancel(cancelAt);

      expect(appointment.toSnapshot()).toEqual({
        ...before,
        status: AppointmentStatus.Cancelled,
        cancelledAt: cancelAt,
      });
    });

    it('rejects cancelling an already cancelled appointment (BR-12)', () => {
      const appointment = Appointment.create(createInput());
      appointment.cancel(cancelAt);

      expect(() => appointment.cancel(cancelAt)).toThrow(AppointmentNotCancellableError);
      expect(appointment.toSnapshot().cancelledAt).toEqual(cancelAt);
    });

    it('reports APPOINTMENT_NOT_CANCELLABLE', () => {
      expect(new AppointmentNotCancellableError().code).toBe('APPOINTMENT_NOT_CANCELLABLE');
    });
  });

  describe('restore', () => {
    const stored = {
      ...createInput(),
      slot: TimeSlot.of(new Date('2026-01-01T02:00:00.000Z'), new Date('2026-01-01T03:00:00.000Z')),
      status: AppointmentStatus.Confirmed,
      createdAt: new Date('2025-12-01T00:00:00.000Z'),
      cancelledAt: null,
    };

    it('rebuilds a past appointment without applying creation rules', () => {
      const { start: _start, durationMinutes: _d, now: _now, ...props } = stored;

      const appointment = Appointment.restore(props);

      expect(appointment.id).toBe(props.id);
      expect(appointment.toSnapshot()).toEqual(props);
    });

    it('rebuilds a cancelled appointment, which cannot be cancelled again', () => {
      const { start: _start, durationMinutes: _d, now: _now, ...props } = stored;
      const appointment = Appointment.restore({
        ...props,
        status: AppointmentStatus.Cancelled,
        cancelledAt: new Date('2025-12-02T00:00:00.000Z'),
      });

      expect(() => appointment.cancel(NOW)).toThrow(AppointmentNotCancellableError);
    });
  });

  it('returns a snapshot that cannot change the entity', () => {
    const appointment = Appointment.create(createInput());
    const snapshot = appointment.toSnapshot() as { status: AppointmentStatus };

    snapshot.status = AppointmentStatus.Cancelled;

    expect(appointment.status).toBe(AppointmentStatus.Confirmed);
  });
});
