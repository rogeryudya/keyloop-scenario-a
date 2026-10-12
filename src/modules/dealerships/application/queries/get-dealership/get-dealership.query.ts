import { Query } from '@nestjs/cqrs';
import { DealershipDetailView } from '../../views/dealership.view';

export class GetDealershipQuery extends Query<DealershipDetailView> {
  constructor(public readonly id: string) {
    super();
  }
}
