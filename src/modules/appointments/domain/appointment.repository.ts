import { TimeSlot } from '../../../shared/domain/time-slot';
import { Appointment } from './appointment.entity';

/** Persistence port for the Appointment aggregate. Also the DI token. */
export abstract class AppointmentRepository {
  /**
   * Inserts or updates. A lost race surfaces as `AppointmentConflictError`: a double booking (BR-10)
   * or an `Idempotency-Key` another request stored first (FR-11); both are worth a retry.
   */
  abstract save(appointment: Appointment): Promise<void>;

  abstract findById(id: string): Promise<Appointment | null>;

  /** FR-11: the appointment booked with this `Idempotency-Key`, if any (case-sensitive). */
  abstract findByIdempotencyKey(key: string): Promise<Appointment | null>;

  /** `CONFIRMED` appointments of the dealership whose slot overlaps `slot` (BR-2, BR-9). */
  abstract findConfirmedOverlapping(dealershipId: string, slot: TimeSlot): Promise<Appointment[]>;

  /**
   * `CONFIRMED` appointments per technician that start on the local calendar day of `dayOf` in
   * `timeZone` (BR-11). Technicians with none are absent from the map.
   */
  abstract countForTechniciansOnDay(
    technicianIds: readonly string[],
    dayOf: Date,
    timeZone: string,
  ): Promise<Map<string, number>>;
}
