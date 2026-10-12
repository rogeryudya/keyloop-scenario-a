import { CursorPosition } from '../../src/shared/application/pagination';
import {
  DealershipReadModel,
  ReadSlice,
} from '../../src/modules/dealerships/application/ports/dealership-read-model';
import {
  DealershipDetailView,
  DealershipView,
} from '../../src/modules/dealerships/application/views/dealership.view';
import { ServiceTypeView } from '../../src/modules/dealerships/application/views/service-type.view';

const newestFirst = (a: CursorPosition, b: CursorPosition): number =>
  b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

const isAfter = (row: CursorPosition, position: CursorPosition | undefined): boolean =>
  position === undefined || newestFirst(position, row) < 0;

function slice<T extends CursorPosition>(rows: readonly T[], { after, take }: ReadSlice): T[] {
  return [...rows]
    .sort(newestFirst)
    .filter((row) => isAfter(row, after))
    .slice(0, take);
}

/** Same ordering and keyset semantics as PrismaDealershipReadModel. */
export class InMemoryDealershipReadModel extends DealershipReadModel {
  readonly slices: ReadSlice[] = [];

  constructor(
    private readonly dealerships: readonly DealershipDetailView[] = [],
    private readonly serviceTypes: readonly ServiceTypeView[] = [],
  ) {
    super();
  }

  listDealerships(request: ReadSlice): Promise<DealershipView[]> {
    this.slices.push(request);
    return Promise.resolve(
      slice(this.dealerships, request).map(({ supportedServiceTypeIds: _ids, ...view }) => view),
    );
  }

  findDealership(id: string): Promise<DealershipDetailView | null> {
    return Promise.resolve(this.dealerships.find((d) => d.id === id) ?? null);
  }

  listServiceTypes(request: ReadSlice): Promise<ServiceTypeView[]> {
    this.slices.push(request);
    return Promise.resolve(slice(this.serviceTypes, request));
  }
}
