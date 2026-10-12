import { CursorPosition } from '../../../../shared/application/pagination';
import { DealershipDetailView, DealershipView } from '../views/dealership.view';
import { ServiceTypeView } from '../views/service-type.view';

/** Keyset page request: rows strictly after `after` in `createdAt DESC, id DESC` order. */
export interface ReadSlice {
  readonly after?: CursorPosition;
  readonly take: number;
}

/** Read port for reference data (A-2: read-only at runtime). Returns views, skipping entities. Also the DI token. */
export abstract class DealershipReadModel {
  abstract listDealerships(slice: ReadSlice): Promise<DealershipView[]>;
  abstract findDealership(id: string): Promise<DealershipDetailView | null>;
  abstract listServiceTypes(slice: ReadSlice): Promise<ServiceTypeView[]>;
}
