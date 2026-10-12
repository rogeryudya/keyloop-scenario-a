import { Appointment as AppointmentRow } from '../../../generated/prisma/client';
import { OpeningHours } from '../../../shared/domain/opening-hours';
import { AppointmentStatus } from '../domain/appointment-status';
import { Appointment } from '../domain/appointment.entity';
import { AppointmentMapper } from './appointment.mapper';

const row: AppointmentRow = {
  id: 'a0000000-0000-4000-8000-000000000001',
  dealershipId: 'd0000000-0000-4000-8000-000000000001',
  serviceBayId: 'b0000000-0000-4000-8000-000000000001',
  technicianId: 't0000000-0000-4000-8000-000000000001',
  serviceTypeId: 's0000000-0000-4000-8000-000000000001',
  customerId: 'c0000000-0000-4000-8000-000000000001',
  vehicleId: 'v0000000-0000-4000-8000-000000000001',
  startAt: new Date('2026-10-13T03:00:00.000Z'),
  endAt: new Date('2026-10-13T03:30:00.000Z'),
  status: 'CANCELLED',
  cancelledAt: new Date('2026-10-12T11:00:00.000Z'),
  createdAt: new Date('2026-10-12T10:00:00.000Z'),
  updatedAt: new Date('2026-10-12T11:00:00.000Z'),
  idempotencyKey: null,
  requestHash: null,
};

describe('AppointmentMapper', () => {
  it('maps a row to an entity with a TimeSlot and domain status', () => {
    const appointment = AppointmentMapper.toDomain(row);

    expect(appointment.status).toBe(AppointmentStatus.Cancelled);
    expect(appointment.slot.start).toEqual(row.startAt);
    expect(appointment.slot.end).toEqual(row.endAt);
    expect(appointment.toSnapshot()).toMatchObject({
      id: row.id,
      technicianId: row.technicianId,
      cancelledAt: row.cancelledAt,
      createdAt: row.createdAt,
    });
  });

  it('maps an entity to persistence input without technical columns', () => {
    const appointment = Appointment.create({
      id: row.id,
      dealershipId: row.dealershipId,
      serviceBayId: row.serviceBayId,
      technicianId: row.technicianId,
      serviceTypeId: row.serviceTypeId,
      customerId: row.customerId,
      vehicleId: row.vehicleId,
      start: row.startAt,
      durationMinutes: 30,
      openingHours: OpeningHours.of({
        opensAt: '08:00',
        closesAt: '18:00',
        timeZone: 'Asia/Bangkok',
      }),
      now: row.createdAt,
    });

    expect(AppointmentMapper.toPersistence(appointment)).toEqual({
      id: row.id,
      dealershipId: row.dealershipId,
      serviceBayId: row.serviceBayId,
      technicianId: row.technicianId,
      serviceTypeId: row.serviceTypeId,
      customerId: row.customerId,
      vehicleId: row.vehicleId,
      startAt: row.startAt,
      endAt: row.endAt,
      status: 'CONFIRMED',
      cancelledAt: null,
      createdAt: row.createdAt,
      idempotencyKey: null,
      requestHash: null,
    });
  });

  it('maps the Idempotency-Key and request hash both ways (FR-11)', () => {
    const keyed = { ...row, idempotencyKey: 'k-1', requestHash: 'a'.repeat(64) };

    const appointment = AppointmentMapper.toDomain(keyed);

    expect(appointment.toSnapshot().idempotency).toEqual({
      key: 'k-1',
      requestHash: 'a'.repeat(64),
    });
    expect(AppointmentMapper.toPersistence(appointment)).toMatchObject({
      idempotencyKey: 'k-1',
      requestHash: 'a'.repeat(64),
    });
  });

  it('leaves idempotency unset for a row without a key', () => {
    expect(AppointmentMapper.toDomain(row).toSnapshot()).not.toHaveProperty('idempotency');
  });

  it('round-trips an entity through persistence', () => {
    const { updatedAt: _u, ...stored } = row;

    expect(AppointmentMapper.toPersistence(AppointmentMapper.toDomain(row))).toEqual(stored);
  });
});
