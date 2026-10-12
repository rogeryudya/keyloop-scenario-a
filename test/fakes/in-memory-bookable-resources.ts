import {
  BookableDealership,
  BookableResources,
  BookableServiceType,
  BookingCandidates,
} from '../../src/modules/appointments/application/ports/bookable-resources';
import {
  BayCandidate,
  TechnicianCandidate,
} from '../../src/modules/appointments/domain/resource-allocator';

export interface BookableResourcesData {
  readonly dealerships?: readonly BookableDealership[];
  readonly serviceTypes?: readonly BookableServiceType[];
  readonly bays?: readonly BayCandidate[];
  /** All technicians with all their qualifications; filtered like the Prisma adapter. */
  readonly technicians?: readonly TechnicianCandidate[];
}

/** Same filtering and ordering as PrismaBookableResources. */
export class InMemoryBookableResources extends BookableResources {
  constructor(private readonly data: BookableResourcesData = {}) {
    super();
  }

  findDealership(id: string): Promise<BookableDealership | null> {
    return Promise.resolve(this.data.dealerships?.find((d) => d.id === id) ?? null);
  }

  findServiceType(id: string): Promise<BookableServiceType | null> {
    return Promise.resolve(this.data.serviceTypes?.find((s) => s.id === id) ?? null);
  }

  findCandidates(dealershipId: string, serviceTypeId: string): Promise<BookingCandidates> {
    const byId = (a: { id: string }, b: { id: string }): number => (a.id < b.id ? -1 : 1);
    return Promise.resolve({
      bays: (this.data.bays ?? []).filter((b) => b.dealershipId === dealershipId).sort(byId),
      technicians: (this.data.technicians ?? [])
        .filter((t) => t.dealershipId === dealershipId && t.serviceTypeIds.includes(serviceTypeId))
        .map((t) => ({ ...t, serviceTypeIds: [serviceTypeId] }))
        .sort(byId),
    });
  }
}
