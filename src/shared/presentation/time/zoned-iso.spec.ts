import { toZonedIso } from './zoned-iso';

describe('toZonedIso', () => {
  // [case, UTC instant, zone, expected]
  it.each([
    ['a zone ahead of UTC', '2030-01-15T01:00:00Z', 'Asia/Bangkok', '2030-01-15T08:00:00+07:00'],
    ['a half-hour offset', '2030-01-15T02:30:00Z', 'Asia/Kolkata', '2030-01-15T08:00:00+05:30'],
    ['a zone behind UTC', '2030-01-15T13:00:00Z', 'America/New_York', '2030-01-15T08:00:00-05:00'],
    ['UTC itself', '2030-01-15T08:00:00Z', 'UTC', '2030-01-15T08:00:00+00:00'],
    ['London in winter', '2026-03-28T08:00:00Z', 'Europe/London', '2026-03-28T08:00:00+00:00'],
    ['London in summer', '2026-03-29T07:00:00Z', 'Europe/London', '2026-03-29T08:00:00+01:00'],
    ['a later local date', '2030-01-14T23:00:00Z', 'Asia/Bangkok', '2030-01-15T06:00:00+07:00'],
  ])('formats %s', (_case, utc, timeZone, expected) => {
    expect(toZonedIso(new Date(utc), timeZone)).toBe(expected);
  });

  it('denotes the same instant as its input', () => {
    const instant = new Date('2030-01-15T03:45:00Z');

    expect(new Date(toZonedIso(instant, 'Asia/Kolkata')).getTime()).toBe(instant.getTime());
  });
});
