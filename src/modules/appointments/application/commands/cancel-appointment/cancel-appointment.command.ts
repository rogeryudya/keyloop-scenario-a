import { Command } from '@nestjs/cqrs';

export class CancelAppointmentCommand extends Command<void> {
  constructor(public readonly id: string) {
    super();
  }
}
