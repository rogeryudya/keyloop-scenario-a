import {
  AppointmentFilter,
  AppointmentReadModel,
  AppointmentSlice,
} from '../../src/modules/appointments/application/ports/appointment-read-model';
import { AppointmentView } from '../../src/modules/appointments/application/views/appointment.view';
import { CursorPosition } from '../../src/shared/application/pagination';

const newestFirst = (a: CursorPosition, b: CursorPosition): number =>
  b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

const matches = (v: AppointmentView, f: AppointmentFilter): boolean =>
  (f.dealershipId === undefined || v.dealership.id === f.dealershipId) &&
  (f.customerId === undefined || v.customer.id === f.customerId) &&
  (f.startFrom === undefined || v.start.getTime() >= f.startFrom.getTime()) &&
  (f.startBefore === undefined || v.start.getTime() < f.startBefore.getTime());

/** Same filtering, ordering and keyset semantics as PrismaAppointmentReadModel. */
export class InMemoryAppointmentReadModel extends AppointmentReadModel {
  readonly requests: { filter: AppointmentFilter; slice: AppointmentSlice }[] = [];

  constructor(private readonly views: readonly AppointmentView[] = []) {
    super();
  }

  findById(id: string): Promise<AppointmentView | null> {
    return Promise.resolve(this.views.find((v) => v.id === id) ?? null);
  }

  list(filter: AppointmentFilter, slice: AppointmentSlice): Promise<AppointmentView[]> {
    this.requests.push({ filter, slice });
    const { after } = slice;
    return Promise.resolve(
      this.views
        .filter((v) => matches(v, filter))
        .sort(newestFirst)
        .filter((v) => after === undefined || newestFirst(after, v) < 0)
        .slice(0, slice.take),
    );
  }
}
