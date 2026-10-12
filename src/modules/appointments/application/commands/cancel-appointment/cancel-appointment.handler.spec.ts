import { FixedClock } from '../../../../../../test/fakes/fixed-clock';
import { InMemoryAppointmentRepository } from '../../../../../../test/fakes/in-memory-appointment-repository';
import { useNoOpTransactions } from '../../../../../../test/helpers/transactions';
import { TimeSlot } from '../../../../../shared/domain/time-slot';
import { AppointmentStatus } from '../../../domain/appointment-status';
import { Appointment } from '../../../domain/appointment.entity';
import {
  AppointmentNotCancellableError,
  AppointmentNotFoundError,
} from '../../../domain/appointment.errors';
import { CancelAppointmentCommand } from './cancel-appointment.command';
import { CancelAppointmentHandler } from './cancel-appointment.handler';

const ID = 'a0000000-0000-4000-8000-000000000001';
const UNKNOWN = 'a0000000-0000-4000-8000-000000000099';
const DEALERSHIP = 'd0000000-0000-4000-8000-000000000001';
const NOW = '2026-10-12T03:00:00.000Z';
const SLOT = TimeSlot.of(new Date('2026-10-13T03:00:00Z'), new Date('2026-10-13T03:30:00Z'));

const appointment = (status = AppointmentStatus.Confirmed) =>
  Appointment.restore({
    id: ID,
    dealershipId: DEALERSHIP,
    serviceBayId: 'b0000000-0000-4000-8000-000000000001',
    technicianId: 't0000000-0000-4000-8000-000000000001',
    serviceTypeId: 's0000000-0000-4000-8000-000000000001',
    customerId: 'c0000000-0000-4000-8000-000000000001',
    vehicleId: 'v0000000-0000-4000-8000-000000000001',
    slot: SLOT,
    status,
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    cancelledAt:
      status === AppointmentStatus.Cancelled ? new Date('2026-10-02T00:00:00.000Z') : null,
  });

describe('CancelAppointmentHandler', () => {
  let closeTransactions: () => Promise<void>;

  beforeAll(async () => {
    closeTransactions = await useNoOpTransactions();
  });

  afterAll(async () => {
    await closeTransactions();
  });

  const setup = (existing: Appointment[]) => {
    const appointments = new InMemoryAppointmentRepository(existing);
    const handler = new CancelAppointmentHandler(appointments, new FixedClock(NOW));
    return { appointments, handler };
  };

  it('cancels a confirmed appointment and records when (FR-8)', async () => {
    const { appointments, handler } = setup([appointment()]);

    await handler.execute(new CancelAppointmentCommand(ID));

    const saved = (await appointments.findById(ID))?.toSnapshot();
    expect(saved).toMatchObject({
      status: AppointmentStatus.Cancelled,
      cancelledAt: new Date(NOW),
    });
  });

  it('frees the slot: it no longer counts as a confirmed overlap (BR-9)', async () => {
    const { appointments, handler } = setup([appointment()]);

    await handler.execute(new CancelAppointmentCommand(ID));

    await expect(appointments.findConfirmedOverlapping(DEALERSHIP, SLOT)).resolves.toEqual([]);
  });

  it('throws APPOINTMENT_NOT_FOUND for an unknown id', async () => {
    const { handler } = setup([appointment()]);

    await expect(handler.execute(new CancelAppointmentCommand(UNKNOWN))).rejects.toThrow(
      AppointmentNotFoundError,
    );
  });

  it('rejects cancelling an already cancelled appointment and leaves it unchanged (BR-12)', async () => {
    const { appointments, handler } = setup([appointment(AppointmentStatus.Cancelled)]);

    await expect(handler.execute(new CancelAppointmentCommand(ID))).rejects.toThrow(
      AppointmentNotCancellableError,
    );
    expect((await appointments.findById(ID))?.toSnapshot().cancelledAt).toEqual(
      new Date('2026-10-02T00:00:00.000Z'),
    );
    expect(appointments.saveAttempts).toBe(0);
  });
});
