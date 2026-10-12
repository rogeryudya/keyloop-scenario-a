import { OpeningHours } from '../../../../shared/domain/opening-hours';
import { BayCandidate, TechnicianCandidate } from '../../domain/resource-allocator';

export interface BookableDealership {
  readonly id: string;
  readonly openingHours: OpeningHours;
}

export interface BookableServiceType {
  readonly id: string;
  readonly durationMinutes: number;
}

export interface BookingCandidates {
  readonly bays: BayCandidate[];
  /** Only technicians of the dealership qualified for the service type. */
  readonly technicians: TechnicianCandidate[];
}

/**
 * Read port for the reference data a booking needs (A-2: read-only at runtime). Implemented by a read
 * adapter in this module's infrastructure, not via the dealerships module's queries; see ../../README.md.
 * Also the DI token.
 */
export abstract class BookableResources {
  abstract findDealership(id: string): Promise<BookableDealership | null>;

  abstract findServiceType(id: string): Promise<BookableServiceType | null>;

  abstract findCandidates(dealershipId: string, serviceTypeId: string): Promise<BookingCandidates>;
}
