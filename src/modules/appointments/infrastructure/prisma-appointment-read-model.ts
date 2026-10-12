import { InjectTransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import { PrismaTransactionHost } from '../../../shared/infrastructure/prisma/transactions.module';
import { AppointmentReadModel } from '../application/ports/appointment-read-model';
import { AppointmentView } from '../application/views/appointment.view';
import { AppointmentStatus } from '../domain/appointment-status';

const STATUS: Record<'CONFIRMED' | 'CANCELLED', AppointmentStatus> = {
  CONFIRMED: AppointmentStatus.Confirmed,
  CANCELLED: AppointmentStatus.Cancelled,
};

@Injectable()
export class PrismaAppointmentReadModel extends AppointmentReadModel {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTransactionHost) {
    super();
  }

  async findById(id: string): Promise<AppointmentView | null> {
    const row = await this.txHost.tx.appointment.findUnique({
      where: { id },
      include: {
        dealership: { select: { id: true, name: true, timeZone: true } },
        serviceBay: { select: { id: true, name: true } },
        technician: { select: { id: true, name: true } },
        serviceType: { select: { id: true, code: true, name: true, durationMinutes: true } },
        customer: { select: { id: true, firstName: true, lastName: true } },
        vehicle: { select: { id: true, registration: true, make: true, model: true } },
      },
    });
    if (!row) return null;
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
  }
}
