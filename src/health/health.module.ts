import { Module } from '@nestjs/common';
import { PrismaService } from '../shared/infrastructure/prisma/prisma.service';
import { DatabaseHealthIndicator } from './database.health';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
  providers: [
    {
      provide: DatabaseHealthIndicator,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new DatabaseHealthIndicator(prisma),
    },
  ],
})
export class HealthModule {}
