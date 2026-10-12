import { Module } from '@nestjs/common';
import { BookableResources } from './application/ports/bookable-resources';
import { AppointmentRepository } from './domain/appointment.repository';
import { PrismaAppointmentRepository } from './infrastructure/prisma-appointment.repository';
import { PrismaBookableResources } from './infrastructure/prisma-bookable-resources';

/** Booking, availability and appointment lifecycle (M2–M3). Handlers, controllers and port → adapter bindings are added here as use cases land. */
@Module({
  providers: [
    { provide: AppointmentRepository, useClass: PrismaAppointmentRepository },
    { provide: BookableResources, useClass: PrismaBookableResources },
  ],
})
export class AppointmentsModule {}
