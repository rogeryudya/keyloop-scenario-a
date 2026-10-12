import { InjectTransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import { CursorPosition } from '../../../shared/application/pagination';
import { PrismaTransactionHost } from '../../../shared/infrastructure/prisma/transactions.module';
import { DealershipReadModel, ReadSlice } from '../application/ports/dealership-read-model';
import { DealershipDetailView, DealershipView } from '../application/views/dealership.view';
import { ServiceTypeView } from '../application/views/service-type.view';

const NEWEST_FIRST = [{ createdAt: 'desc' }, { id: 'desc' }] as const;

/** Keyset condition for `createdAt DESC, id DESC`: rows strictly after the cursor position. */
const after = (position: CursorPosition | undefined) =>
  position === undefined
    ? {}
    : {
        OR: [
          { createdAt: { lt: position.createdAt } },
          { createdAt: position.createdAt, id: { lt: position.id } },
        ],
      };

/** `time` columns come back as a Date on 1970-01-01 UTC; only the wall-clock part matters. */
const wallClock = (time: Date): string => time.toISOString().slice(11, 16);

interface DealershipRow {
  id: string;
  name: string;
  timeZone: string;
  opensAt: Date;
  closesAt: Date;
  createdAt: Date;
}

const toView = (row: DealershipRow): DealershipView => ({
  id: row.id,
  name: row.name,
  timeZone: row.timeZone,
  opensAt: wallClock(row.opensAt),
  closesAt: wallClock(row.closesAt),
  createdAt: row.createdAt,
});

@Injectable()
export class PrismaDealershipReadModel extends DealershipReadModel {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTransactionHost) {
    super();
  }

  async listDealerships({ after: position, take }: ReadSlice): Promise<DealershipView[]> {
    const rows = await this.txHost.tx.dealership.findMany({
      where: after(position),
      orderBy: [...NEWEST_FIRST],
      take,
    });
    return rows.map(toView);
  }

  async findDealership(id: string): Promise<DealershipDetailView | null> {
    const row = await this.txHost.tx.dealership.findUnique({ where: { id } });
    if (!row) return null;
    const qualifications = await this.txHost.tx.technicianQualification.findMany({
      where: { technician: { dealershipId: id } },
      select: { serviceTypeId: true },
      distinct: ['serviceTypeId'],
      orderBy: { serviceTypeId: 'asc' },
    });
    return { ...toView(row), supportedServiceTypeIds: qualifications.map((q) => q.serviceTypeId) };
  }

  async listServiceTypes({ after: position, take }: ReadSlice): Promise<ServiceTypeView[]> {
    return this.txHost.tx.serviceType.findMany({
      where: after(position),
      orderBy: [...NEWEST_FIRST],
      take,
      select: { id: true, code: true, name: true, durationMinutes: true, createdAt: true },
    });
  }
}
