import { AppointmentStatus } from '../../src/modules/appointments/domain/appointment-status';
import { Appointment } from '../../src/modules/appointments/domain/appointment.entity';
import { AppointmentConflictError } from '../../src/modules/appointments/domain/appointment.errors';
import { AppointmentRepository } from '../../src/modules/appointments/domain/appointment.repository';
import { TimeSlot } from '../../src/shared/domain/time-slot';

const localDate = (instant: Date, timeZone: string): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone, dateStyle: 'short' }).format(instant);

const keyOf = (a: Appointment): string | undefined => a.toSnapshot().idempotency?.key;

/** Same semantics as PrismaAppointmentRepository, minus the DB constraints. Stores copies. */
export class InMemoryAppointmentRepository extends AppointmentRepository {
  private readonly rows = new Map<string, Appointment>();
  private lostRaces: ((attempted: Appointment) => Appointment | undefined)[] = [];
  saveAttempts = 0;

  constructor(existing: readonly Appointment[] = []) {
    super();
    existing.forEach((a) => this.rows.set(a.id, Appointment.restore(a.toSnapshot())));
  }

  get all(): Appointment[] {
    return [...this.rows.values()].map((a) => Appointment.restore(a.toSnapshot()));
  }

  /**
   * The next `times` saves lose a race (BR-10): `winner` (if given) is stored as the concurrent
   * booking that committed first, then the save rejects with AppointmentConflictError.
   */
  loseNextSaves(times: number, winner?: (attempted: Appointment) => Appointment): void {
    this.lostRaces = Array.from({ length: times }, () => (a: Appointment) => winner?.(a));
  }

  save(appointment: Appointment): Promise<void> {
    this.saveAttempts += 1;
    const lostRace = this.lostRaces.shift();
    if (lostRace) {
      const winner = lostRace(appointment);
      if (winner) this.rows.set(winner.id, Appointment.restore(winner.toSnapshot()));
      return Promise.reject(new AppointmentConflictError());
    }
    const key = appointment.toSnapshot().idempotency?.key;
    if (key !== undefined && this.all.some((a) => a.id !== appointment.id && keyOf(a) === key)) {
      return Promise.reject(new AppointmentConflictError()); // like the unique index (FR-11)
    }
    this.rows.set(appointment.id, Appointment.restore(appointment.toSnapshot()));
    return Promise.resolve();
  }

  findByIdempotencyKey(key: string): Promise<Appointment | null> {
    return Promise.resolve(this.all.find((a) => keyOf(a) === key) ?? null);
  }

  findById(id: string): Promise<Appointment | null> {
    const found = this.rows.get(id);
    return Promise.resolve(found ? Appointment.restore(found.toSnapshot()) : null);
  }

  findConfirmedOverlapping(dealershipId: string, slot: TimeSlot): Promise<Appointment[]> {
    return Promise.resolve(
      this.all
        .filter(
          (a) =>
            a.toSnapshot().dealershipId === dealershipId &&
            a.status === AppointmentStatus.Confirmed &&
            a.slot.overlaps(slot),
        )
        .sort((a, b) => a.slot.start.getTime() - b.slot.start.getTime() || (a.id < b.id ? -1 : 1)),
    );
  }

  countForTechniciansOnDay(
    technicianIds: readonly string[],
    dayOf: Date,
    timeZone: string,
  ): Promise<Map<string, number>> {
    const day = localDate(dayOf, timeZone);
    const counts = new Map<string, number>();
    for (const a of this.all) {
      const { technicianId, status } = a.toSnapshot();
      if (!technicianIds.includes(technicianId) || status !== AppointmentStatus.Confirmed) continue;
      if (localDate(a.slot.start, timeZone) !== day) continue;
      counts.set(technicianId, (counts.get(technicianId) ?? 0) + 1);
    }
    return Promise.resolve(counts);
  }
}
