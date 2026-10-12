import { InjectTransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import { PrismaTransactionHost } from '../../../shared/infrastructure/prisma/transactions.module';
import { Prisma } from '../../../generated/prisma/client';
import {
  AppointmentFilter,
  AppointmentReadModel,
  AppointmentSlice,
} from '../application/ports/appointment-read-model';
import { AppointmentView } from '../application/views/appointment.view';
import { AppointmentStatus } from '../domain/appointment-status';

const STATUS: Record<'CONFIRMED' | 'CANCELLED', AppointmentStatus> = {
  CONFIRMED: AppointmentStatus.Confirmed,
  CANCELLED: AppointmentStatus.Cancelled,
};

const LINKED = {
  dealership: { select: { id: true, name: true, timeZone: true } },
  serviceBay: { select: { id: true, name: true } },
  technician: { select: { id: true, name: true } },
  serviceType: { select: { id: true, code: true, name: true, durationMinutes: true } },
  customer: { select: { id: true, firstName: true, lastName: true } },
  vehicle: { select: { id: true, registration: true, make: true, model: true } },
} satisfies Prisma.AppointmentInclude;

type AppointmentRowWithLinks = Prisma.AppointmentGetPayload<{ include: typeof LINKED }>;

const toView = (row: AppointmentRowWithLinks): AppointmentView => {
  const { firstName, lastName, ...customer } = row.customer;
  return {
    id: row.id,
    status: STATUS[row.status],
    start: row.startAt,
    end: row.endAt,
    createdAt: row.createdAt,
    cancelledAt: row.cancelledAt,
    dealership: row.dealership,
    serviceBay: row.serviceBay,
    technician: row.technician,
    serviceType: row.serviceType,
    customer: { ...customer, name: `${firstName} ${lastName}` },
    vehicle: row.vehicle,
  };
};

@Injectable()
export class PrismaAppointmentReadModel extends AppointmentReadModel {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTransactionHost) {
    super();
  }

  async findById(id: string): Promise<AppointmentView | null> {
    const row = await this.txHost.tx.appointment.findUnique({ where: { id }, include: LINKED });
    return row ? toView(row) : null;
  }

  /** `createdAt DESC, id DESC` keyset pagination; served by the (dealership|customer, created_at, id) indexes. */
  async list(
    filter: AppointmentFilter,
    { after, take }: AppointmentSlice,
  ): Promise<AppointmentView[]> {
    const rows = await this.txHost.tx.appointment.findMany({
      where: {
        dealershipId: filter.dealershipId,
        customerId: filter.customerId,
        startAt: { gte: filter.startFrom, lt: filter.startBefore },
        ...(after && {
          OR: [
            { createdAt: { lt: after.createdAt } },
            { createdAt: after.createdAt, id: { lt: after.id } },
          ],
        }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
      include: LINKED,
    });
    return rows.map(toView);
  }
}
