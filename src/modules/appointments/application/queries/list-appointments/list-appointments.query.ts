import { Query } from '@nestjs/cqrs';
import { Page, PageRequest } from '../../../../../shared/application/pagination';
import { AppointmentFilter } from '../../ports/appointment-read-model';
import { AppointmentView } from '../../views/appointment.view';

export class ListAppointmentsQuery extends Query<Page<AppointmentView>> {
  constructor(
    /** At least `dealershipId` or `customerId`; the presentation layer enforces it (A-15). */
    public readonly filter: AppointmentFilter,
    public readonly page: PageRequest,
  ) {
    super();
  }
}
