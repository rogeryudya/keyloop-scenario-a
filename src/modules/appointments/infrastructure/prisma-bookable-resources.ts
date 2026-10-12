import { InjectTransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import { OpeningHours } from '../../../shared/domain/opening-hours';
import { PrismaTransactionHost } from '../../../shared/infrastructure/prisma/transactions.module';
import {
  BookableDealership,
  BookableResources,
  BookableServiceType,
  BookingCandidates,
} from '../application/ports/bookable-resources';

/** `time` columns come back as a Date on 1970-01-01 UTC; only the wall-clock part matters. */
const wallClock = (time: Date): string => time.toISOString().slice(11, 16);

/** Reads the dealerships module's reference tables directly (read-only, A-2); see ../README.md. */
@Injectable()
export class PrismaBookableResources extends BookableResources {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTransactionHost) {
    super();
  }

  async findDealership(id: string): Promise<BookableDealership | null> {
    const row = await this.txHost.tx.dealership.findUnique({ where: { id } });
    if (!row) return null;
    return {
      id: row.id,
      openingHours: OpeningHours.of({
        opensAt: wallClock(row.opensAt),
        closesAt: wallClock(row.closesAt),
        timeZone: row.timeZone,
      }),
    };
  }

  async findServiceType(id: string): Promise<BookableServiceType | null> {
    return this.txHost.tx.serviceType.findUnique({
      where: { id },
      select: { id: true, durationMinutes: true },
    });
  }

  async findCandidates(dealershipId: string, serviceTypeId: string): Promise<BookingCandidates> {
    // Sequential: inside a transaction both queries share one connection anyway.
    const bays = await this.txHost.tx.serviceBay.findMany({
      where: { dealershipId },
      select: { id: true, dealershipId: true },
      orderBy: { id: 'asc' },
    });
    const technicians = await this.txHost.tx.technician.findMany({
      where: { dealershipId, qualifications: { some: { serviceTypeId } } },
      select: { id: true, dealershipId: true },
      orderBy: { id: 'asc' },
    });
    return {
      bays,
      technicians: technicians.map((t) => ({ ...t, serviceTypeIds: [serviceTypeId] })),
    };
  }
}
