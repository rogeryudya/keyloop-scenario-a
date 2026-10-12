import { AppointmentStatus } from '../../src/modules/appointments/domain/appointment-status';
import { Appointment } from '../../src/modules/appointments/domain/appointment.entity';
import { AppointmentRepository } from '../../src/modules/appointments/domain/appointment.repository';
import { TimeSlot } from '../../src/shared/domain/time-slot';

const localDate = (instant: Date, timeZone: string): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone, dateStyle: 'short' }).format(instant);

/** Same semantics as PrismaAppointmentRepository, minus the DB constraints. Stores copies. */
export class InMemoryAppointmentRepository extends AppointmentRepository {
  private readonly rows = new Map<string, Appointment>();

  constructor(existing: readonly Appointment[] = []) {
    super();
    existing.forEach((a) => this.rows.set(a.id, Appointment.restore(a.toSnapshot())));
  }

  get all(): Appointment[] {
    return [...this.rows.values()].map((a) => Appointment.restore(a.toSnapshot()));
  }

  save(appointment: Appointment): Promise<void> {
    this.rows.set(appointment.id, Appointment.restore(appointment.toSnapshot()));
    return Promise.resolve();
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
        .sort((a, b) => a.slot.start.getTime() - b.slot.start.getTime()),
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
