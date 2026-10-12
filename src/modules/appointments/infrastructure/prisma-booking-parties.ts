import { InjectTransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import { PrismaTransactionHost } from '../../../shared/infrastructure/prisma/transactions.module';
import { BookingParties } from '../application/ports/booking-parties';

/** Reads the customers module's tables directly (read-only, A-2); see ../README.md. */
@Injectable()
export class PrismaBookingParties extends BookingParties {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTransactionHost) {
    super();
  }

  async customerExists(customerId: string): Promise<boolean> {
    const row = await this.txHost.tx.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });
    return row !== null;
  }

  async findVehicleOwnerId(vehicleId: string): Promise<string | null> {
    const row = await this.txHost.tx.vehicle.findUnique({
      where: { id: vehicleId },
      select: { customerId: true },
    });
    return row?.customerId ?? null;
  }
}
