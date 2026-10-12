import { InjectTransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import { PrismaTransactionHost } from '../../../shared/infrastructure/prisma/transactions.module';
import { Prisma } from '../../../generated/prisma/client';
import { IdempotencyKeys, IdempotencyRecord } from '../application/ports/idempotency-keys';
import { AppointmentConflictError } from '../domain/appointment.errors';

const UNIQUE_VIOLATION = 'P2002';

@Injectable()
export class PrismaIdempotencyKeys extends IdempotencyKeys {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTransactionHost) {
    super();
  }

  async find(key: string): Promise<IdempotencyRecord | null> {
    return this.txHost.tx.idempotencyKey.findUnique({
      where: { key },
      select: { key: true, requestHash: true, appointmentId: true, createdAt: true },
    });
  }

  async save(record: IdempotencyRecord): Promise<void> {
    try {
      await this.txHost.tx.idempotencyKey.create({ data: record });
    } catch (error) {
      // A concurrent request with the same key committed first (ADR-0007): retry to replay it.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_VIOLATION
      ) {
        throw new AppointmentConflictError();
      }
      throw error;
    }
  }
}
