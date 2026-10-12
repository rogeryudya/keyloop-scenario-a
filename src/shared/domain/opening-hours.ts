import { ValidationError } from './errors';
import { TimeSlot } from './time-slot';

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const WALL_CLOCK_TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class InvalidOpeningHoursError extends ValidationError {
  constructor(field: string, issue: string) {
    super('INVALID_OPENING_HOURS', 'Invalid opening hours', [{ field, issue }]);
  }
}

export interface OpeningHoursProps {
  /** Local wall-clock time `HH:mm`. */
  readonly opensAt: string;
  /** Local wall-clock time `HH:mm`, after `opensAt` (no overnight opening, A-6). */
  readonly closesAt: string;
  /** IANA zone name, e.g. `Asia/Bangkok`. */
  readonly timeZone: string;
}

interface LocalTime {
  readonly date: string;
  readonly msOfDay: number;
}

/**
 * One daily opening window in the dealership's time zone (A-6). Local times are resolved per instant
 * through the zone's rules, so DST days are handled without assuming a fixed offset.
 */
export class OpeningHours {
  private readonly formatter: Intl.DateTimeFormat;

  private constructor(
    readonly opensAt: string,
    readonly closesAt: string,
    readonly timeZone: string,
    private readonly opensMs: number,
    private readonly closesMs: number,
  ) {
    this.formatter = OpeningHours.formatterFor(timeZone);
  }

  static of(props: OpeningHoursProps): OpeningHours {
    const opensMs = OpeningHours.parseWallClock('opensAt', props.opensAt);
    const closesMs = OpeningHours.parseWallClock('closesAt', props.closesAt);
    if (closesMs <= opensMs) {
      throw new InvalidOpeningHoursError('closesAt', 'must be after opensAt');
    }
    try {
      OpeningHours.formatterFor(props.timeZone);
    } catch {
      throw new InvalidOpeningHoursError('timeZone', 'must be a valid IANA time zone');
    }
    return new OpeningHours(props.opensAt, props.closesAt, props.timeZone, opensMs, closesMs);
  }

  /** BR-4: the whole slot falls within one day's window; ending exactly at closing time is allowed. */
  contains(slot: TimeSlot): boolean {
    const start = this.toLocal(slot.start);
    const end = this.toLocal(slot.end);
    return start.date === end.date && start.msOfDay >= this.opensMs && end.msOfDay <= this.closesMs;
  }

  private toLocal(instant: Date): LocalTime {
    const parts = this.formatter.formatToParts(instant);
    const part = (type: Intl.DateTimeFormatPartTypes): string =>
      parts.find((p) => p.type === type)?.value ?? '';
    const msOfDay =
      Number(part('hour')) * MS_PER_HOUR +
      Number(part('minute')) * MS_PER_MINUTE +
      Number(part('second')) * 1000 +
      instant.getUTCMilliseconds();
    return { date: `${part('year')}-${part('month')}-${part('day')}`, msOfDay };
  }

  private static parseWallClock(field: string, value: string): number {
    const match = WALL_CLOCK_TIME.exec(value);
    if (!match) throw new InvalidOpeningHoursError(field, 'must be a time in HH:mm format');
    return Number(match[1]) * MS_PER_HOUR + Number(match[2]) * MS_PER_MINUTE;
  }

  /** Throws `RangeError` for an unknown time zone. */
  private static formatterFor(timeZone: string): Intl.DateTimeFormat {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
  }
}
