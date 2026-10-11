import { FixedClock } from './fixed-clock';

describe('FixedClock', () => {
  it('returns the configured time', () => {
    expect(new FixedClock('2026-03-01T10:00:00Z').now().toISOString()).toBe(
      '2026-03-01T10:00:00.000Z',
    );
  });

  it('does not move on its own', () => {
    const clock = new FixedClock();

    expect(clock.now()).toEqual(clock.now());
  });

  it('advances by the given milliseconds', () => {
    const clock = new FixedClock('2026-03-01T10:00:00Z');
    clock.advance(90 * 60_000);

    expect(clock.now().toISOString()).toBe('2026-03-01T11:30:00.000Z');
  });

  it('can be set to a new time', () => {
    const clock = new FixedClock();
    clock.set('2027-01-01T00:00:00Z');

    expect(clock.now().toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('returns copies so callers cannot change its time', () => {
    const clock = new FixedClock('2026-03-01T10:00:00Z');
    clock.now().setUTCFullYear(1999);

    expect(clock.now().getUTCFullYear()).toBe(2026);
  });
});
