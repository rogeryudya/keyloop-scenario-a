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
/** Only `appointments.idempotency_key` is unique besides the PK, which the app never reuses. */
const UNIQUE_VIOLATION = 'P2002';
/** Deadlock (40P01) or serialization failure (40001); Prisma asks the caller to retry. */
const WRITE_CONFLICT = 'P2034';

/** With the pg driver adapter, the SQLSTATE sits in `meta.driverAdapterError.cause.originalCode`. */
const isExclusionViolation = (error: Prisma.PrismaClientKnownRequestError): boolean => {
  const adapterError = error.meta?.driverAdapterError;
  if (typeof adapterError !== 'object' || adapterError === null) return false;
  const cause = (adapterError as { cause?: { originalCode?: unknown } }).cause;
  return cause?.originalCode === EXCLUSION_VIOLATION;
};

/**
 * A concurrent booking won, and this attempt must be retried in a fresh transaction:
 * - exclusion violation: an overlapping booking committed first (BR-10);
 * - unique violation: a request with the same Idempotency-Key committed first (FR-11);
 * - write conflict: Postgres aborted this transaction to break a deadlock. Exclusion constraints
 *   check after inserting, so two inserts racing for the same bay or technician can wait on each
 *   other; Postgres kills one, and the retry sees the survivor's result.
 */
export const isLostBookingRace = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  (isExclusionViolation(error) || error.code === UNIQUE_VIOLATION || error.code === WRITE_CONFLICT);

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
      // The DB constraints are the last line of defence (BR-10, FR-11); the handler retries.
      if (isLostBookingRace(error)) throw new AppointmentConflictError();
      throw error;
    }
  }

  async findById(id: string): Promise<Appointment | null> {
    const row = await this.txHost.tx.appointment.findUnique({ where: { id } });
    return row ? AppointmentMapper.toDomain(row) : null;
  }

  async findByIdempotencyKey(key: string): Promise<Appointment | null> {
    const row = await this.txHost.tx.appointment.findUnique({ where: { idempotencyKey: key } });
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
