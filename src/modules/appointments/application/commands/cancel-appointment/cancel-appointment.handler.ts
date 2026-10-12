import { Transactional } from '@nestjs-cls/transactional';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Clock } from '../../../../../shared/domain/clock';
import { AppointmentNotFoundError } from '../../../domain/appointment.errors';
import { AppointmentRepository } from '../../../domain/appointment.repository';
import { CancelAppointmentCommand } from './cancel-appointment.command';

@CommandHandler(CancelAppointmentCommand)
export class CancelAppointmentHandler implements ICommandHandler<CancelAppointmentCommand> {
  constructor(
    private readonly appointments: AppointmentRepository,
    private readonly clock: Clock,
  ) {}

  /** FR-8. Once cancelled, the appointment no longer occupies its bay or technician (BR-9). */
  @Transactional()
  async execute({ id }: CancelAppointmentCommand): Promise<void> {
    const appointment = await this.appointments.findById(id);
    if (!appointment) throw new AppointmentNotFoundError(id);
    appointment.cancel(this.clock.now()); // BR-12
    await this.appointments.save(appointment);
  }
}
