import {
  IdempotencyKeys,
  IdempotencyRecord,
} from '../../src/modules/appointments/application/ports/idempotency-keys';
import { AppointmentConflictError } from '../../src/modules/appointments/domain/appointment.errors';

/** Same semantics as PrismaIdempotencyKeys, minus transactions. */
export class InMemoryIdempotencyKeys extends IdempotencyKeys {
  private readonly records = new Map<string, IdempotencyRecord>();
  private concurrentWinners: IdempotencyRecord[] = [];

  get all(): IdempotencyRecord[] {
    return [...this.records.values()];
  }

  /** The next save loses a race: `winner` is stored as if committed first, then the save rejects. */
  loseNextSave(winner: IdempotencyRecord): void {
    this.concurrentWinners.push(winner);
  }

  find(key: string): Promise<IdempotencyRecord | null> {
    return Promise.resolve(this.records.get(key) ?? null);
  }

  save(record: IdempotencyRecord): Promise<void> {
    const winner = this.concurrentWinners.shift();
    if (winner) this.records.set(winner.key, winner);
    if (this.records.has(record.key)) return Promise.reject(new AppointmentConflictError());
    this.records.set(record.key, { ...record });
    return Promise.resolve();
  }
}
