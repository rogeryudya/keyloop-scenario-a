import { ValidationError } from './errors';
import { InvalidTimeSlotError, TimeSlot } from './time-slot';

const at = (hhmm: string): Date => new Date(`2026-10-13T${hhmm}:00.000Z`);
const slot = (from: string, to: string): TimeSlot => TimeSlot.of(at(from), at(to));

describe('TimeSlot', () => {
  describe('creation', () => {
    it('keeps start and end', () => {
      const s = slot('09:00', '10:30');

      expect(s.start).toEqual(at('09:00'));
      expect(s.end).toEqual(at('10:30'));
      expect(s.durationMinutes).toBe(90);
    });

    it('builds end from start and duration (BR-1)', () => {
      const s = TimeSlot.fromStartAndDuration(at('09:00'), 45);

      expect(s.end).toEqual(at('09:45'));
    });

    it('accepts the smallest positive interval', () => {
      const start = at('09:00');

      expect(() => TimeSlot.of(start, new Date(start.getTime() + 1))).not.toThrow();
    });

    it('rejects end equal to start', () => {
      expect(() => slot('09:00', '09:00')).toThrow(InvalidTimeSlotError);
    });

    it('rejects end before start', () => {
      expect(() => slot('10:00', '09:00')).toThrow(InvalidTimeSlotError);
    });

    it.each([0, -30, Number.NaN])('rejects a duration of %p minutes', (minutes) => {
      expect(() => TimeSlot.fromStartAndDuration(at('09:00'), minutes)).toThrow(
        InvalidTimeSlotError,
      );
    });

    it('rejects an invalid date', () => {
      expect(() => TimeSlot.of(new Date('not a date'), at('10:00'))).toThrow(InvalidTimeSlotError);
      expect(() => TimeSlot.of(at('09:00'), new Date('not a date'))).toThrow(InvalidTimeSlotError);
    });

    it('raises a validation error with a stable code', () => {
      const error = (() => {
        try {
          slot('10:00', '09:00');
        } catch (e) {
          return e;
        }
        return undefined;
      })();

      expect(error).toBeInstanceOf(ValidationError);
      expect(error).toMatchObject({ code: 'INVALID_TIME_SLOT' });
    });
  });

  describe('overlaps (half-open, BR-2)', () => {
    const base = slot('09:00', '10:00');

    it.each([
      ['identical', slot('09:00', '10:00')],
      ['partial at the start', slot('08:30', '09:30')],
      ['partial at the end', slot('09:30', '10:30')],
      ['enclosed', slot('09:15', '09:45')],
      ['enclosing', slot('08:00', '11:00')],
      ['same start, shorter', slot('09:00', '09:30')],
      ['same end, shorter', slot('09:30', '10:00')],
    ])('overlaps when %s', (_case, other) => {
      expect(base.overlaps(other)).toBe(true);
      expect(other.overlaps(base)).toBe(true);
    });

    it.each([
      ['back-to-back before', slot('08:00', '09:00')],
      ['back-to-back after', slot('10:00', '11:00')],
      ['disjoint before', slot('07:00', '08:00')],
      ['disjoint after', slot('11:00', '12:00')],
    ])('does not overlap when %s', (_case, other) => {
      expect(base.overlaps(other)).toBe(false);
      expect(other.overlaps(base)).toBe(false);
    });

    it('overlaps by a single millisecond', () => {
      const other = TimeSlot.of(new Date(at('10:00').getTime() - 1), at('11:00'));

      expect(base.overlaps(other)).toBe(true);
    });
  });

  describe('value semantics', () => {
    it('is equal to a slot with the same bounds', () => {
      expect(slot('09:00', '10:00').equals(slot('09:00', '10:00'))).toBe(true);
      expect(slot('09:00', '10:00').equals(slot('09:00', '10:01'))).toBe(false);
    });

    it('is not changed by mutating the input or returned dates', () => {
      const start = at('09:00');
      const s = TimeSlot.of(start, at('10:00'));

      start.setUTCHours(5);
      s.start.setUTCHours(5);
      s.end.setUTCHours(23);

      expect(s.start).toEqual(at('09:00'));
      expect(s.end).toEqual(at('10:00'));
    });
  });
});
