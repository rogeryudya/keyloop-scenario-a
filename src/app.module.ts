import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AppConfigModule } from './config/config.module';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { CustomersModule } from './modules/customers/customers.module';
import { DealershipsModule } from './modules/dealerships/dealerships.module';
import { ClockModule } from './shared/infrastructure/clock/clock.module';
import { PrismaModule } from './shared/infrastructure/prisma/prisma.module';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    ClockModule,
    // Registers CommandBus/QueryBus/EventBus globally; feature modules only declare their handlers.
    CqrsModule.forRoot(),
    DealershipsModule,
    CustomersModule,
    AppointmentsModule,
  ],
})
export class AppModule {}
