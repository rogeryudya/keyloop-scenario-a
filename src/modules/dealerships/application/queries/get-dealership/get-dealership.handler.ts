import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { DealershipNotFoundError } from '../../../domain/dealership.errors';
import { DealershipReadModel } from '../../ports/dealership-read-model';
import { DealershipDetailView } from '../../views/dealership.view';
import { GetDealershipQuery } from './get-dealership.query';

@QueryHandler(GetDealershipQuery)
export class GetDealershipHandler implements IQueryHandler<GetDealershipQuery> {
  constructor(private readonly readModel: DealershipReadModel) {}

  async execute({ id }: GetDealershipQuery): Promise<DealershipDetailView> {
    const dealership = await this.readModel.findDealership(id);
    if (!dealership) throw new DealershipNotFoundError(id);
    return dealership;
  }
}
