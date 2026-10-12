import { Query } from '@nestjs/cqrs';
import { Page, PageRequest } from '../../../../../shared/application/pagination';
import { ServiceTypeView } from '../../views/service-type.view';

export class ListServiceTypesQuery extends Query<Page<ServiceTypeView>> {
  constructor(public readonly page: PageRequest) {
    super();
  }
}
