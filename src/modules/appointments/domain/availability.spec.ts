import { InvalidLocalDateError, OpeningHours } from '../../../shared/domain/opening-hours';
import { TimeSlot } from '../../../shared/domain/time-slot';
import { AppointmentStatus } from './appointment-status';
import { ServiceTypeNotSupportedError } from './appointment.errors';
import { Availability, AvailabilityRequest } from './availability';
import { BayCandidate, ExistingBooking, TechnicianCandidate } from './resource-allocator';

// Bangkok (UTC+7), open 08:00–18:00 local = 01:00Z–11:00Z on 2026-10-13.
const DEALERSHIP = 'd0000000-0000-4000-8000-000000000001';
const OTHER_DEALERSHIP = 'd0000000-0000-4000-8000-000000000002';
const OIL_CHANGE = 's0000000-0000-4000-8000-000000000001';
const TYRES = 's0000000-0000-4000-8000-000000000002';
const BAY_1 = 'b0000000-0000-4000-8000-000000000001';
const BAY_2 = 'b0000000-0000-4000-8000-000000000002';
const TECH_1 = 't0000000-0000-4000-8000-000000000001';
const TECH_2 = 't0000000-0000-4000-8000-000000000002';

const DATE = '2026-10-13';
const DAY_BEFORE = new Date('2026-10-12T03:00:00.000Z');

/** Local Bangkok wall-clock time on DATE → instant. */
const local = (hhmm: string): Date => new Date(`${DATE}T${hhmm}:00.000+07:00`);
const localSlot = (from: string, to: string): TimeSlot => TimeSlot.of(local(from), local(to));
/** Start times as local `HH:mm`, for readable assertions. */
const startsOf = (slots: TimeSlot[]): string[] =>
  slots.map((s) => new Date(s.start.getTime() + 7 * 3_600_000).toISOString().slice(11, 16));

const bangkokHours = (opensAt = '08:00', closesAt = '18:00'): OpeningHours =>
  OpeningHours.of({ opensAt, closesAt, timeZone: 'Asia/Bangkok' });

const bay = (id: string, dealershipId = DEALERSHIP): BayCandidate => ({ id, dealershipId });
const technician = (id: string, serviceTypeIds = [OIL_CHANGE]): TechnicianCandidate => ({
  id,
  dealershipId: DEALERSHIP,
  serviceTypeIds,
});
const booking = (overrides: Partial<ExistingBooking> = {}): ExistingBooking => ({
  dealershipId: DEALERSHIP,
  serviceBayId: BAY_1,
  technicianId: TECH_1,
  slot: localSlot('08:00', '18:00'),
  status: AppointmentStatus.Confirmed,
  ...overrides,
});

const request = (overrides: Partial<AvailabilityRequest> = {}): AvailabilityRequest => ({
  dealershipId: DEALERSHIP,
  serviceTypeId: OIL_CHANGE,
  durationMinutes: 60,
  date: DATE,
  openingHours: bangkokHours(),
  now: DAY_BEFORE,
  bays: [bay(BAY_1)],
  technicians: [technician(TECH_1)],
  bookings: [],
  ...overrides,
});

const slotsOn = (overrides: Partial<AvailabilityRequest> = {}): TimeSlot[] =>
  Availability.slotsOn(request(overrides));

/** Every 15 minutes from `from` to `to` inclusive, as local `HH:mm`. */
const grid = (from: string, to: string): string[] => {
  const result: string[] = [];
  for (let t = local(from).getTime(); t <= local(to).getTime(); t += 15 * 60_000) {
    result.push(new Date(t + 7 * 3_600_000).toISOString().slice(11, 16));
  }
  return result;
};

describe('Availability', () => {
  describe('on a fully free day', () => {
    it('offers every 15-minute start from opening until the service no longer fits', () => {
      expect(startsOf(slotsOn())).toEqual(grid('08:00', '17:00'));
    });

    it('returns slots whose end is start + duration (BR-1)', () => {
      const [first] = slotsOn({ durationMinutes: 45 });

      expect(first?.equals(localSlot('08:00', '08:45'))).toBe(true);
    });
  });

  describe('closing time (BR-4)', () => {
    it('offers the last slot that ends exactly at closing, and not the next one', () => {
      const starts = startsOf(slotsOn({ durationMinutes: 45 }));

      expect(starts.at(-1)).toBe('17:15'); // 17:15 + 45 min = 18:00
      expect(starts).not.toContain('17:30');
    });

    it('offers nothing when the service is longer than the opening window', () => {
      expect(slotsOn({ durationMinutes: 11 * 60 })).toEqual([]);
    });

    it('offers exactly one slot when the service fills the whole window', () => {
      expect(startsOf(slotsOn({ durationMinutes: 10 * 60 }))).toEqual(['08:00']);
    });

    it('counts the grid from opening time, not from the hour (A-14)', () => {
      const starts = startsOf(slotsOn({ openingHours: bangkokHours('08:10', '09:30') }));

      expect(starts).toEqual(['08:10', '08:25']);
    });
  });

  describe('a fully booked day', () => {
    it('offers nothing when the only bay and technician are busy all day', () => {
      expect(slotsOn({ bookings: [booking()] })).toEqual([]);
    });

    it('offers nothing when every bay is busy all day, even with technicians free (BR-7)', () => {
      const bookings = [
        booking({ serviceBayId: BAY_1, technicianId: 'x1' }),
        booking({ serviceBayId: BAY_2, technicianId: 'x2' }),
      ];

      const slots = slotsOn({
        bays: [bay(BAY_1), bay(BAY_2)],
        technicians: [technician(TECH_1), technician(TECH_2)],
        bookings,
      });

      expect(slots).toEqual([]);
    });
  });

  describe('partly booked', () => {
    it('removes only the slots overlapping a booking; back-to-back is fine (BR-2)', () => {
      const starts = startsOf(
        slotsOn({ bookings: [booking({ slot: localSlot('10:00', '12:00') })] }),
      );

      expect(starts).toContain('09:00'); // 09:00–10:00 ends as the booking starts
      expect(starts).not.toContain('09:15'); // 09:15–10:15 overlaps
      expect(starts).not.toContain('11:45');
      expect(starts).toContain('12:00'); // starts as the booking ends
    });

    it('removes slots blocked only by technician qualification, though a bay is free (BR-8)', () => {
      // TECH_1 (qualified) is busy 10:00–12:00 in BAY_1. BAY_2 and TECH_2 are free, but TECH_2
      // only does tyres.
      const slots = slotsOn({
        bays: [bay(BAY_1), bay(BAY_2)],
        technicians: [technician(TECH_1), technician(TECH_2, [TYRES])],
        bookings: [booking({ slot: localSlot('10:00', '12:00') })],
      });

      const starts = startsOf(slots);
      expect(starts).toContain('09:00');
      expect(starts.filter((s) => s >= '09:15' && s <= '11:45')).toEqual([]);
      expect(starts).toContain('12:00');
    });

    it('keeps a slot when a second qualified technician and bay are free', () => {
      const slots = slotsOn({
        bays: [bay(BAY_1), bay(BAY_2)],
        technicians: [technician(TECH_1), technician(TECH_2)],
        bookings: [booking({ slot: localSlot('10:00', '12:00') })],
      });

      expect(startsOf(slots)).toEqual(grid('08:00', '17:00'));
    });

    it('ignores cancelled bookings (BR-9)', () => {
      const slots = slotsOn({ bookings: [booking({ status: AppointmentStatus.Cancelled })] });

      expect(startsOf(slots)).toEqual(grid('08:00', '17:00'));
    });

    it("ignores another dealership's bookings and bays", () => {
      const slots = slotsOn({
        bays: [bay(BAY_1), bay(BAY_2, OTHER_DEALERSHIP)],
        bookings: [booking({ dealershipId: OTHER_DEALERSHIP })],
      });

      expect(startsOf(slots)).toEqual(grid('08:00', '17:00'));
    });
  });

  describe('past slots (BR-3)', () => {
    it('removes slots starting at or before now on today', () => {
      const starts = startsOf(slotsOn({ now: local('10:00') }));

      expect(starts[0]).toBe('10:15'); // 10:00 starts exactly at now: in the past, like booking
      expect(starts.at(-1)).toBe('17:00');
    });

    it('offers the next grid point when now is between two', () => {
      expect(startsOf(slotsOn({ now: local('10:07') }))[0]).toBe('10:15');
    });

    it('offers nothing for a day already over', () => {
      expect(slotsOn({ now: new Date('2026-10-14T00:00:00.000Z') })).toEqual([]);
    });
  });

  describe('service type support (BR-6)', () => {
    it('rejects when no technician at the dealership is qualified', () => {
      const run = () => slotsOn({ technicians: [technician(TECH_1, [TYRES])] });

      expect(run).toThrow(ServiceTypeNotSupportedError);
      expect(run).toThrow(
        'This dealership does not offer the service type, so it has no availability for it',
      );
    });

    it('rejects even when the day is over, so the answer does not depend on the clock', () => {
      const run = () => slotsOn({ technicians: [], now: new Date('2026-10-14T00:00:00.000Z') });

      expect(run).toThrow(ServiceTypeNotSupportedError);
    });
  });

  it('rejects an invalid date', () => {
    expect(() => slotsOn({ date: '2026-02-30' })).toThrow(InvalidLocalDateError);
  });
});
