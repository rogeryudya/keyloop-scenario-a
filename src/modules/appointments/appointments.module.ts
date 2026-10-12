import { Module } from '@nestjs/common';
import { CancelAppointmentHandler } from './application/commands/cancel-appointment/cancel-appointment.handler';
import { CreateAppointmentHandler } from './application/commands/create-appointment/create-appointment.handler';
import { AppointmentReadModel } from './application/ports/appointment-read-model';
import { BookableResources } from './application/ports/bookable-resources';
import { BookingParties } from './application/ports/booking-parties';
import { GetAppointmentHandler } from './application/queries/get-appointment/get-appointment.handler';
import { GetAvailabilityHandler } from './application/queries/get-availability/get-availability.handler';
import { AppointmentRepository } from './domain/appointment.repository';
import { PrismaAppointmentReadModel } from './infrastructure/prisma-appointment-read-model';
import { PrismaAppointmentRepository } from './infrastructure/prisma-appointment.repository';
import { PrismaBookableResources } from './infrastructure/prisma-bookable-resources';
import { PrismaBookingParties } from './infrastructure/prisma-booking-parties';
import { AppointmentController } from './presentation/appointment.controller';
import { AvailabilityController } from './presentation/availability.controller';

/** Booking, availability and appointment lifecycle (M2–M3). Handlers, controllers and port → adapter bindings are added here as use cases land. */
@Module({
  controllers: [AppointmentController, AvailabilityController],
  providers: [
    CreateAppointmentHandler,
    CancelAppointmentHandler,
    GetAppointmentHandler,
    GetAvailabilityHandler,
    { provide: AppointmentRepository, useClass: PrismaAppointmentRepository },
    { provide: AppointmentReadModel, useClass: PrismaAppointmentReadModel },
    { provide: BookableResources, useClass: PrismaBookableResources },
    { provide: BookingParties, useClass: PrismaBookingParties },
  ],
})
export class AppointmentsModule {}
