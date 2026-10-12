import { Command } from '@nestjs/cqrs';

/** FR-1: book a service appointment; bay and technician are allocated by the system (A-4). */
export class CreateAppointmentCommand extends Command<{ id: string }> {
  constructor(
    public readonly customerId: string,
    public readonly vehicleId: string,
    public readonly dealershipId: string,
    public readonly serviceTypeId: string,
    public readonly start: Date,
  ) {
    super();
  }
}
