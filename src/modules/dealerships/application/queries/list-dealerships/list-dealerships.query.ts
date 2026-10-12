import { Query } from '@nestjs/cqrs';
import { Page, PageRequest } from '../../../../../shared/application/pagination';
import { DealershipView } from '../../views/dealership.view';

export class ListDealershipsQuery extends Query<Page<DealershipView>> {
  constructor(public readonly page: PageRequest) {
    super();
  }
}
