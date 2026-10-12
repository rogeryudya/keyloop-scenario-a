import { Clock } from '../../src/shared/domain/clock';

/** A Clock that only moves when told to. Returns copies, so callers can't mutate "now". */
export class FixedClock extends Clock {
  private current: Date;

  constructor(now: Date | string = '2026-01-01T09:00:00.000Z') {
    super();
    this.current = new Date(now);
  }

  now(): Date {
    return new Date(this.current);
  }

  set(now: Date | string): void {
    this.current = new Date(now);
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}
