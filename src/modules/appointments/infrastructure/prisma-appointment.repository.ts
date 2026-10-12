import { InjectTransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import { TimeSlot } from '../../../shared/domain/time-slot';
import { PrismaTransactionHost } from '../../../shared/infrastructure/prisma/transactions.module';
import { Prisma } from '../../../generated/prisma/client';
import { Appointment } from '../domain/appointment.entity';
import { AppointmentConflictError } from '../domain/appointment.errors';
import { AppointmentRepository } from '../domain/appointment.repository';
import { AppointmentMapper } from './appointment.mapper';

const EXCLUSION_VIOLATION = '23P01';

/** With the pg driver adapter, the SQLSTATE sits in `meta.driverAdapterError.cause.originalCode`. */
const isExclusionViolation = (error: unknown): boolean => {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  const adapterError = error.meta?.driverAdapterError;
  if (typeof adapterError !== 'object' || adapterError === null) return false;
  const cause = (adapterError as { cause?: { originalCode?: unknown } }).cause;
  return cause?.originalCode === EXCLUSION_VIOLATION;
};

@Injectable()
export class PrismaAppointmentRepository extends AppointmentRepository {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTransactionHost) {
    super();
  }

  async save(appointment: Appointment): Promise<void> {
    const data = AppointmentMapper.toPersistence(appointment);
    try {
      await this.txHost.tx.appointment.upsert({
        where: { id: data.id },
        create: data,
        update: { status: data.status, cancelledAt: data.cancelledAt },
      });
    } catch (error) {
      // BR-10: a concurrent booking committed first; the exclusion constraint is the last line of defence.
      if (isExclusionViolation(error)) throw new AppointmentConflictError();
      throw error;
    }
  }

  async findById(id: string): Promise<Appointment | null> {
    const row = await this.txHost.tx.appointment.findUnique({ where: { id } });
    return row ? AppointmentMapper.toDomain(row) : null;
  }

  async findConfirmedOverlapping(dealershipId: string, slot: TimeSlot): Promise<Appointment[]> {
    // Half-open overlap (BR-2): existing.start < slot.end AND slot.start < existing.end.
    const rows = await this.txHost.tx.appointment.findMany({
      where: {
        dealershipId,
        status: 'CONFIRMED',
        startAt: { lt: slot.end },
        endAt: { gt: slot.start },
      },
      orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => AppointmentMapper.toDomain(row));
  }

  async countForTechniciansOnDay(
    technicianIds: readonly string[],
    dayOf: Date,
    timeZone: string,
  ): Promise<Map<string, number>> {
    if (technicianIds.length === 0) return new Map();
    // Local midnight → next local midnight, converted back to instants, so DST days stay correct
    // and start_at can use an index range.
    const rows = await this.txHost.tx.$queryRaw<{ technicianId: string; count: number }[]>`
      WITH day AS (
        SELECT date_trunc('day', ${dayOf}::timestamptz AT TIME ZONE ${timeZone}) AS local_midnight
      )
      SELECT a.technician_id::text AS "technicianId", count(*)::int AS "count"
      FROM appointments a, day
      WHERE a.technician_id = ANY(${[...technicianIds]}::uuid[])
        AND a.status = 'CONFIRMED'
        AND a.start_at >= (day.local_midnight AT TIME ZONE ${timeZone})
        AND a.start_at < ((day.local_midnight + interval '1 day') AT TIME ZONE ${timeZone})
      GROUP BY a.technician_id`;
    return new Map(rows.map((r) => [r.technicianId, r.count]));
  }
}
