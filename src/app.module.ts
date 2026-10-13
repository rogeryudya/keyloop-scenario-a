import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AppConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { CustomersModule } from './modules/customers/customers.module';
import { DealershipsModule } from './modules/dealerships/dealerships.module';
import { LoggingModule } from './shared/infrastructure/logging/logging.module';
import { ClockModule } from './shared/infrastructure/clock/clock.module';
import { PrismaModule } from './shared/infrastructure/prisma/prisma.module';
import { TransactionsModule } from './shared/infrastructure/prisma/transactions.module';
import { TracingModule } from './shared/infrastructure/tracing/tracing.module';

@Module({
  imports: [
    AppConfigModule,
    LoggingModule,
    PrismaModule,
    TransactionsModule,
    ClockModule,
    // Registers CommandBus/QueryBus/EventBus globally; feature modules only declare their handlers.
    CqrsModule.forRoot(),
    TracingModule,
    DealershipsModule,
    CustomersModule,
    AppointmentsModule,
    HealthModule,
  ],
})
export class AppModule {}
