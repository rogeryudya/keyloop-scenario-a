import { Query } from '@nestjs/cqrs';
import { AppointmentView } from '../../views/appointment.view';

export class GetAppointmentQuery extends Query<AppointmentView> {
  constructor(public readonly id: string) {
    super();
  }
}
