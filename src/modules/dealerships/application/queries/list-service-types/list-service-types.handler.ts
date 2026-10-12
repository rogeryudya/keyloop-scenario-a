import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Cursor, Page, buildPage } from '../../../../../shared/application/pagination';
import { DealershipReadModel } from '../../ports/dealership-read-model';
import { ServiceTypeView } from '../../views/service-type.view';
import { ListServiceTypesQuery } from './list-service-types.query';

@QueryHandler(ListServiceTypesQuery)
export class ListServiceTypesHandler implements IQueryHandler<ListServiceTypesQuery> {
  constructor(private readonly readModel: DealershipReadModel) {}

  async execute({ page }: ListServiceTypesQuery): Promise<Page<ServiceTypeView>> {
    const after = page.cursor === undefined ? undefined : Cursor.decode(page.cursor);
    const rows = await this.readModel.listServiceTypes({ after, take: page.limit + 1 });
    return buildPage(rows, page.limit, (s) => s);
  }
}
