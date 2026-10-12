import {
  AppointmentStatus as AppointmentStatusRow,
  Appointment as AppointmentRow,
  Prisma,
} from '../../../generated/prisma/client';
import { TimeSlot } from '../../../shared/domain/time-slot';
import { AppointmentStatus } from '../domain/appointment-status';
import { Appointment } from '../domain/appointment.entity';

const toDomainStatus: Record<AppointmentStatusRow, AppointmentStatus> = {
  CONFIRMED: AppointmentStatus.Confirmed,
  CANCELLED: AppointmentStatus.Cancelled,
};

const toRowStatus: Record<AppointmentStatus, AppointmentStatusRow> = {
  [AppointmentStatus.Confirmed]: 'CONFIRMED',
  [AppointmentStatus.Cancelled]: 'CANCELLED',
};

/** Prisma row ↔ Appointment entity. `TimeSlot` is stored as `start_at`/`end_at`. */
export const AppointmentMapper = {
  toDomain(row: AppointmentRow): Appointment {
    return Appointment.restore({
      id: row.id,
      dealershipId: row.dealershipId,
      serviceBayId: row.serviceBayId,
      technicianId: row.technicianId,
      serviceTypeId: row.serviceTypeId,
      customerId: row.customerId,
      vehicleId: row.vehicleId,
      slot: TimeSlot.of(row.startAt, row.endAt),
      status: toDomainStatus[row.status],
      createdAt: row.createdAt,
      cancelledAt: row.cancelledAt,
      ...(row.idempotencyKey !== null &&
        row.requestHash !== null && {
          idempotency: { key: row.idempotencyKey, requestHash: row.requestHash },
        }),
    });
  },

  toPersistence(appointment: Appointment): Prisma.AppointmentUncheckedCreateInput {
    const { slot, status, idempotency, ...rest } = appointment.toSnapshot();
    return {
      ...rest,
      startAt: slot.start,
      endAt: slot.end,
      status: toRowStatus[status],
      idempotencyKey: idempotency?.key ?? null,
      requestHash: idempotency?.requestHash ?? null,
    };
  },
};
