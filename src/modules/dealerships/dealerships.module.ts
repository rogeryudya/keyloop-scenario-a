import { Module } from '@nestjs/common';
import { DealershipReadModel } from './application/ports/dealership-read-model';
import { GetDealershipHandler } from './application/queries/get-dealership/get-dealership.handler';
import { ListDealershipsHandler } from './application/queries/list-dealerships/list-dealerships.handler';
import { ListServiceTypesHandler } from './application/queries/list-service-types/list-service-types.handler';
import { PrismaDealershipReadModel } from './infrastructure/prisma-dealership-read-model';
import { DealershipController } from './presentation/dealership.controller';
import { ServiceTypeController } from './presentation/service-type.controller';

/** Dealerships and their reference data: bays, technicians, service types, opening hours. Read-only at runtime (A-2). */
@Module({
  controllers: [DealershipController, ServiceTypeController],
  providers: [
    ListDealershipsHandler,
    GetDealershipHandler,
    ListServiceTypesHandler,
    { provide: DealershipReadModel, useClass: PrismaDealershipReadModel },
  ],
})
export class DealershipsModule {}
