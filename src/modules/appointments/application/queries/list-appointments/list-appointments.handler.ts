import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Cursor, Page, buildPage } from '../../../../../shared/application/pagination';
import { AppointmentReadModel } from '../../ports/appointment-read-model';
import { AppointmentView } from '../../views/appointment.view';
import { ListAppointmentsQuery } from './list-appointments.query';

@QueryHandler(ListAppointmentsQuery)
export class ListAppointmentsHandler implements IQueryHandler<ListAppointmentsQuery> {
  constructor(private readonly readModel: AppointmentReadModel) {}

  /** FR-9. */
  async execute({ filter, page }: ListAppointmentsQuery): Promise<Page<AppointmentView>> {
    const after = page.cursor === undefined ? undefined : Cursor.decode(page.cursor);
    const rows = await this.readModel.list(filter, { after, take: page.limit + 1 });
    return buildPage(rows, page.limit, (a) => a);
  }
}
