import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { AppointmentNotFoundError } from '../../../domain/appointment.errors';
import { AppointmentReadModel } from '../../ports/appointment-read-model';
import { AppointmentView } from '../../views/appointment.view';
import { GetAppointmentQuery } from './get-appointment.query';

@QueryHandler(GetAppointmentQuery)
export class GetAppointmentHandler implements IQueryHandler<GetAppointmentQuery> {
  constructor(private readonly readModel: AppointmentReadModel) {}

  async execute({ id }: GetAppointmentQuery): Promise<AppointmentView> {
    const appointment = await this.readModel.findById(id);
    if (!appointment) throw new AppointmentNotFoundError(id);
    return appointment;
  }
}
