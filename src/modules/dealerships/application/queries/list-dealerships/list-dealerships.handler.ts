import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Cursor, Page, buildPage } from '../../../../../shared/application/pagination';
import { DealershipReadModel } from '../../ports/dealership-read-model';
import { DealershipView } from '../../views/dealership.view';
import { ListDealershipsQuery } from './list-dealerships.query';

@QueryHandler(ListDealershipsQuery)
export class ListDealershipsHandler implements IQueryHandler<ListDealershipsQuery> {
  constructor(private readonly readModel: DealershipReadModel) {}

  async execute({ page }: ListDealershipsQuery): Promise<Page<DealershipView>> {
    const after = page.cursor === undefined ? undefined : Cursor.decode(page.cursor);
    const rows = await this.readModel.listDealerships({ after, take: page.limit + 1 });
    return buildPage(rows, page.limit, (d) => d);
  }
}
