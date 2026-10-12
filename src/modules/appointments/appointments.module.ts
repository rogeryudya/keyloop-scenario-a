import { Module } from '@nestjs/common';
import { CreateAppointmentHandler } from './application/commands/create-appointment/create-appointment.handler';
import { BookableResources } from './application/ports/bookable-resources';
import { BookingParties } from './application/ports/booking-parties';
import { AppointmentRepository } from './domain/appointment.repository';
import { PrismaAppointmentRepository } from './infrastructure/prisma-appointment.repository';
import { PrismaBookableResources } from './infrastructure/prisma-bookable-resources';
import { PrismaBookingParties } from './infrastructure/prisma-booking-parties';

/** Booking, availability and appointment lifecycle (M2–M3). Handlers, controllers and port → adapter bindings are added here as use cases land. */
@Module({
  providers: [
    CreateAppointmentHandler,
    { provide: AppointmentRepository, useClass: PrismaAppointmentRepository },
    { provide: BookableResources, useClass: PrismaBookableResources },
    { provide: BookingParties, useClass: PrismaBookingParties },
  ],
})
export class AppointmentsModule {}
