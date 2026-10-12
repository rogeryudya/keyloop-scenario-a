import { ValidationError } from './errors';
import { InvalidLocalDateError, InvalidOpeningHoursError, OpeningHours } from './opening-hours';
import { TimeSlot } from './time-slot';

const utc = (iso: string): Date => new Date(`${iso}Z`);
const slot = (from: string, to: string): TimeSlot => TimeSlot.of(utc(from), utc(to));
const thrownBy = (fn: () => unknown): unknown => {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('expected an error to be thrown');
};

describe('OpeningHours', () => {
  describe('creation', () => {
    it('keeps its values', () => {
      const hours = OpeningHours.of({
        opensAt: '08:00',
        closesAt: '18:00',
        timeZone: 'Asia/Bangkok',
      });

      expect(hours).toMatchObject({
        opensAt: '08:00',
        closesAt: '18:00',
        timeZone: 'Asia/Bangkok',
      });
    });

    it.each([
      ['closing equal to opening', { opensAt: '08:00', closesAt: '08:00' }, 'closesAt'],
      ['closing before opening (overnight)', { opensAt: '22:00', closesAt: '06:00' }, 'closesAt'],
      ['a malformed opening time', { opensAt: '8:00', closesAt: '18:00' }, 'opensAt'],
      ['an out-of-range closing time', { opensAt: '08:00', closesAt: '24:00' }, 'closesAt'],
      ['seconds in the time', { opensAt: '08:00:00', closesAt: '18:00' }, 'opensAt'],
    ])('rejects %s', (_case, times, field) => {
      const error = thrownBy(() => OpeningHours.of({ ...times, timeZone: 'Asia/Bangkok' }));

      expect(error).toBeInstanceOf(InvalidOpeningHoursError);
      expect(error).toMatchObject({ code: 'INVALID_OPENING_HOURS', details: [{ field }] });
    });

    it.each(['Mars/Olympus_Mons', ''])('rejects the unknown time zone %p', (timeZone) => {
      expect(() => OpeningHours.of({ opensAt: '08:00', closesAt: '18:00', timeZone })).toThrow(
        InvalidOpeningHoursError,
      );
    });

    it('raises a validation error', () => {
      const error = thrownBy(() =>
        OpeningHours.of({ opensAt: '18:00', closesAt: '08:00', timeZone: 'Asia/Bangkok' }),
      );

      expect(error).toBeInstanceOf(ValidationError);
    });
  });

  describe('contains, in a fixed-offset zone (Asia/Bangkok, UTC+7)', () => {
    const hours = OpeningHours.of({
      opensAt: '08:00',
      closesAt: '18:00',
      timeZone: 'Asia/Bangkok',
    });

    it.each([
      ['starting exactly at opening (08:00-09:00)', slot('2026-10-13T01:00', '2026-10-13T02:00')],
      ['in the middle of the day (12:00-13:30)', slot('2026-10-13T05:00', '2026-10-13T06:30')],
      ['ending exactly at closing (17:00-18:00)', slot('2026-10-13T10:00', '2026-10-13T11:00')],
      ['spanning the whole window (08:00-18:00)', slot('2026-10-13T01:00', '2026-10-13T11:00')],
    ])('accepts a slot %s', (_case, s) => {
      expect(hours.contains(s)).toBe(true);
    });

    it.each([
      ['starting a minute before opening', slot('2026-10-13T00:59', '2026-10-13T02:00')],
      ['ending a minute after closing', slot('2026-10-13T10:00', '2026-10-13T11:01')],
      ['ending a millisecond after closing', slot('2026-10-13T10:00', '2026-10-13T11:00:00.001')],
      ['entirely before opening (06:00-07:00)', slot('2026-10-12T23:00', '2026-10-13T00:00')],
      ['starting exactly at closing (18:00-19:00)', slot('2026-10-13T11:00', '2026-10-13T12:00')],
      ['longer than the window (07:00-19:00)', slot('2026-10-13T00:00', '2026-10-13T12:00')],
      ['spanning two days (17:00 to 09:00 next day)', slot('2026-10-13T10:00', '2026-10-14T02:00')],
    ])('rejects a slot %s', (_case, s) => {
      expect(hours.contains(s)).toBe(false);
    });

    it('judges by local date, not UTC date (local 08:00 is the previous UTC day)', () => {
      const earlyMorning = OpeningHours.of({
        opensAt: '06:00',
        closesAt: '10:00',
        timeZone: 'Asia/Bangkok',
      });

      // 06:30-07:30 local on 2026-10-13 = 23:30-00:30 UTC across 2026-10-12/13.
      expect(earlyMorning.contains(slot('2026-10-12T23:30', '2026-10-13T00:30'))).toBe(true);
    });

    it('rejects the seed case: 120 min at 15:30 when closing at 17:00 (Ho Chi Minh City)', () => {
      const hcm = OpeningHours.of({
        opensAt: '08:00',
        closesAt: '17:00',
        timeZone: 'Asia/Ho_Chi_Minh',
      });

      expect(hcm.contains(TimeSlot.fromStartAndDuration(utc('2026-10-13T08:30'), 120))).toBe(false);
    });
  });

  describe('contains, in a DST zone (Europe/London)', () => {
    const hours = OpeningHours.of({
      opensAt: '08:00',
      closesAt: '18:00',
      timeZone: 'Europe/London',
    });

    it('uses GMT (UTC+0) on the day before clocks go forward', () => {
      // 2026-03-28: 07:00Z is 07:00 local.
      expect(hours.contains(slot('2026-03-28T07:00', '2026-03-28T08:00'))).toBe(false);
      expect(hours.contains(slot('2026-03-28T08:00', '2026-03-28T09:00'))).toBe(true);
    });

    it('uses BST (UTC+1) on the day clocks go forward', () => {
      // 2026-03-29, clocks go forward at 01:00Z: 07:00Z is 08:00 local, 17:00Z is 18:00 local.
      expect(hours.contains(slot('2026-03-29T07:00', '2026-03-29T08:00'))).toBe(true);
      expect(hours.contains(slot('2026-03-29T16:00', '2026-03-29T17:00'))).toBe(true);
      expect(hours.contains(slot('2026-03-29T16:30', '2026-03-29T17:30'))).toBe(false);
      expect(hours.contains(slot('2026-03-29T06:30', '2026-03-29T07:30'))).toBe(false);
    });

    it('uses GMT (UTC+0) again on the day clocks go back', () => {
      // 2026-10-25, clocks go back at 01:00Z: 07:30Z is 07:30 local.
      expect(hours.contains(slot('2026-10-25T07:30', '2026-10-25T08:30'))).toBe(false);
      expect(hours.contains(slot('2026-10-25T08:00', '2026-10-25T09:00'))).toBe(true);
      expect(hours.contains(slot('2026-10-25T17:00', '2026-10-25T18:00'))).toBe(true);
    });
  });

  describe('windowOn', () => {
    const hoursIn = (timeZone: string, opensAt = '08:00', closesAt = '18:00'): OpeningHours =>
      OpeningHours.of({ opensAt, closesAt, timeZone });

    // [case, zone, local date, expected UTC start, expected UTC end]
    it.each([
      [
        'a fixed-offset zone (Bangkok, UTC+7)',
        'Asia/Bangkok',
        '2026-10-13',
        '10-13T01:00',
        '10-13T11:00',
      ],
      [
        'a half-hour offset zone (Kolkata, UTC+5:30)',
        'Asia/Kolkata',
        '2026-10-13',
        '10-13T02:30',
        '10-13T12:30',
      ],
      [
        'a zone behind UTC (New York, UTC-4)',
        'America/New_York',
        '2026-10-13',
        '10-13T12:00',
        '10-13T22:00',
      ],
      [
        'London the day before clocks go forward (GMT)',
        'Europe/London',
        '2026-03-28',
        '03-28T08:00',
        '03-28T18:00',
      ],
      [
        'London the day clocks go forward (BST)',
        'Europe/London',
        '2026-03-29',
        '03-29T07:00',
        '03-29T17:00',
      ],
      [
        'London the day clocks go back (GMT)',
        'Europe/London',
        '2026-10-25',
        '10-25T08:00',
        '10-25T18:00',
      ],
    ])('returns the window in %s', (_case, timeZone, date, from, to) => {
      const window = hoursIn(timeZone).windowOn(date);

      expect(window.equals(slot(`2026-${from}`, `2026-${to}`))).toBe(true);
    });

    it('treats the date as local: early opening in Bangkok starts on the previous UTC day', () => {
      const window = hoursIn('Asia/Bangkok', '06:00', '10:00').windowOn('2026-10-13');

      expect(window.equals(slot('2026-10-12T23:00', '2026-10-13T03:00'))).toBe(true);
    });

    it('returns a window that contains() accepts end to end', () => {
      const hours = hoursIn('Europe/London');

      expect(hours.contains(hours.windowOn('2026-03-29'))).toBe(true);
    });

    it.each([
      '2026-02-30',
      '2026-13-01',
      '2026-00-10',
      '2026-1-05',
      '13/10/2026',
      '2026-10-13T00:00',
      '',
    ])('rejects the invalid date %p', (date) => {
      const error = thrownBy(() => hoursIn('Asia/Bangkok').windowOn(date));

      expect(error).toBeInstanceOf(InvalidLocalDateError);
      expect(error).toBeInstanceOf(ValidationError);
      expect(error).toMatchObject({ code: 'INVALID_DATE', details: [{ field: 'date' }] });
    });

    it('accepts 29 February in a leap year', () => {
      expect(() => hoursIn('Asia/Bangkok').windowOn('2028-02-29')).not.toThrow();
    });
  });
});
