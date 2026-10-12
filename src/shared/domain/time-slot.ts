import { ValidationError } from './errors';

const MS_PER_MINUTE = 60_000;

export class InvalidTimeSlotError extends ValidationError {
  constructor(issue: string) {
    super('INVALID_TIME_SLOT', 'Invalid time slot', [{ field: 'slot', issue }]);
  }
}

/**
 * Half-open interval `[start, end)` (BR-2): `end` is excluded, so back-to-back slots don't overlap.
 * Immutable; `start`/`end` return copies because `Date` is mutable.
 */
export class TimeSlot {
  private constructor(
    private readonly startMs: number,
    private readonly endMs: number,
  ) {}

  static of(start: Date, end: Date): TimeSlot {
    const startMs = start.getTime();
    const endMs = end.getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
      throw new InvalidTimeSlotError('start and end must be valid dates');
    }
    if (endMs <= startMs) throw new InvalidTimeSlotError('end must be after start');
    return new TimeSlot(startMs, endMs);
  }

  /** BR-1: end = start + duration. */
  static fromStartAndDuration(start: Date, durationMinutes: number): TimeSlot {
    return TimeSlot.of(start, new Date(start.getTime() + durationMinutes * MS_PER_MINUTE));
  }

  get start(): Date {
    return new Date(this.startMs);
  }

  get end(): Date {
    return new Date(this.endMs);
  }

  get durationMinutes(): number {
    return (this.endMs - this.startMs) / MS_PER_MINUTE;
  }

  overlaps(other: TimeSlot): boolean {
    return this.startMs < other.endMs && other.startMs < this.endMs;
  }

  equals(other: TimeSlot): boolean {
    return this.startMs === other.startMs && this.endMs === other.endMs;
  }
}
