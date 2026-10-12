import { TimeSlot } from '../../../shared/domain/time-slot';
import { Appointment } from './appointment.entity';

/** Persistence port for the Appointment aggregate. Also the DI token. */
export abstract class AppointmentRepository {
  /** Inserts or updates. A lost double-booking race surfaces as `AppointmentConflictError` (BR-10). */
  abstract save(appointment: Appointment): Promise<void>;

  abstract findById(id: string): Promise<Appointment | null>;

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
