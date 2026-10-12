import { TimeSlot } from '../../../shared/domain/time-slot';
import { AppointmentStatus } from './appointment-status';
import {
  NoServiceBayAvailableError,
  NoTechnicianAvailableError,
  ServiceTypeNotSupportedError,
} from './appointment.errors';
import {
  AllocationRequest,
  BayCandidate,
  ExistingBooking,
  ResourceAllocator,
  TechnicianCandidate,
} from './resource-allocator';

const DEALERSHIP = 'd0000000-0000-4000-8000-000000000001';
const OTHER_DEALERSHIP = 'd0000000-0000-4000-8000-000000000002';
const OIL_CHANGE = 's0000000-0000-4000-8000-000000000001';
const TYRES = 's0000000-0000-4000-8000-000000000002';
const BAY_1 = 'b0000000-0000-4000-8000-000000000001';
const BAY_2 = 'b0000000-0000-4000-8000-000000000002';
const TECH_1 = 't0000000-0000-4000-8000-000000000001';
const TECH_2 = 't0000000-0000-4000-8000-000000000002';

const at = (hhmm: string): Date => new Date(`2026-10-13T${hhmm}:00.000Z`);
const slot = (from: string, to: string): TimeSlot => TimeSlot.of(at(from), at(to));

/** Requested slot for every test: 10:00–11:00. */
const REQUESTED = slot('10:00', '11:00');

const bay = (id: string, dealershipId = DEALERSHIP): BayCandidate => ({ id, dealershipId });
const technician = (
  id: string,
  serviceTypeIds: string[] = [OIL_CHANGE],
  dealershipId = DEALERSHIP,
): TechnicianCandidate => ({ id, dealershipId, serviceTypeIds });
const booking = (overrides: Partial<ExistingBooking> = {}): ExistingBooking => ({
  dealershipId: DEALERSHIP,
  serviceBayId: BAY_1,
  technicianId: TECH_1,
  slot: REQUESTED,
  status: AppointmentStatus.Confirmed,
  ...overrides,
});

const request = (overrides: Partial<AllocationRequest> = {}): AllocationRequest => ({
  dealershipId: DEALERSHIP,
  serviceTypeId: OIL_CHANGE,
  slot: REQUESTED,
  bays: [bay(BAY_1)],
  technicians: [technician(TECH_1)],
  bookings: [],
  technicianDayLoad: new Map(),
  ...overrides,
});

const allocate = (overrides: Partial<AllocationRequest> = {}) =>
  ResourceAllocator.allocate(request(overrides));

describe('ResourceAllocator', () => {
  it('allocates the free bay and qualified technician', () => {
    expect(allocate()).toEqual({ serviceBayId: BAY_1, technicianId: TECH_1 });
  });

  describe('service type support (BR-6)', () => {
    it('rejects when the dealership has no technicians', () => {
      expect(() => allocate({ technicians: [] })).toThrow(ServiceTypeNotSupportedError);
    });

    it('rejects when no technician is qualified for the service type', () => {
      expect(() => allocate({ technicians: [technician(TECH_1, [TYRES])] })).toThrow(
        ServiceTypeNotSupportedError,
      );
    });

    it('ignores a qualified technician of another dealership', () => {
      expect(() =>
        allocate({ technicians: [technician(TECH_1, [OIL_CHANGE], OTHER_DEALERSHIP)] }),
      ).toThrow(ServiceTypeNotSupportedError);
    });

    it('reports it even when every bay is busy', () => {
      expect(() => allocate({ technicians: [technician(TECH_1, [TYRES])], bays: [] })).toThrow(
        ServiceTypeNotSupportedError,
      );
    });

    it('reports SERVICE_TYPE_NOT_SUPPORTED on the serviceTypeId field', () => {
      expect(new ServiceTypeNotSupportedError()).toMatchObject({
        code: 'SERVICE_TYPE_NOT_SUPPORTED',
        details: [{ field: 'serviceTypeId' }],
      });
    });
  });

  describe('overlap boundaries (BR-2)', () => {
    it.each([
      ['ends exactly at the requested start', '09:00', '10:00'],
      ['starts exactly at the requested end', '11:00', '12:00'],
    ])('treats a booking that %s as free (back-to-back)', (_case, from, to) => {
      const bookings = [booking({ slot: slot(from, to) })];

      expect(allocate({ bookings })).toEqual({ serviceBayId: BAY_1, technicianId: TECH_1 });
    });

    it.each([
      ['overlaps the start by one minute', '09:00', '10:01'],
      ['overlaps the end by one minute', '10:59', '12:00'],
      ['encloses the requested slot', '09:00', '12:00'],
      ['lies inside the requested slot', '10:15', '10:45'],
      ['matches the requested slot exactly', '10:00', '11:00'],
    ])('treats a booking that %s as busy', (_case, from, to) => {
      const bookings = [booking({ slot: slot(from, to) })];

      expect(() => allocate({ bookings })).toThrow(NoServiceBayAvailableError);
    });
  });

  describe('bay availability (BR-7)', () => {
    it('rejects when the dealership has no bays', () => {
      expect(() => allocate({ bays: [] })).toThrow(NoServiceBayAvailableError);
    });

    it('rejects when the only bay is busy but the technician is free', () => {
      const bookings = [booking({ serviceBayId: BAY_1, technicianId: TECH_2 })];

      expect(() => allocate({ bookings })).toThrow(NoServiceBayAvailableError);
    });

    it('ignores a free bay of another dealership', () => {
      const bays = [bay(BAY_1), bay(BAY_2, OTHER_DEALERSHIP)];
      const bookings = [booking({ serviceBayId: BAY_1, technicianId: TECH_2 })];

      expect(() => allocate({ bays, bookings })).toThrow(NoServiceBayAvailableError);
    });

    it('picks another bay when one is busy', () => {
      const bays = [bay(BAY_1), bay(BAY_2)];
      const bookings = [booking({ serviceBayId: BAY_1, technicianId: TECH_2 })];

      expect(allocate({ bays, bookings }).serviceBayId).toBe(BAY_2);
    });

    it('reports the bay error when neither bay nor technician is free (A-13)', () => {
      expect(() => allocate({ bookings: [booking()] })).toThrow(NoServiceBayAvailableError);
    });

    it('reports NO_SERVICE_BAY_AVAILABLE', () => {
      expect(new NoServiceBayAvailableError().code).toBe('NO_SERVICE_BAY_AVAILABLE');
    });
  });

  describe('technician availability (BR-8)', () => {
    it('rejects when the only qualified technician is busy but a bay is free', () => {
      const bays = [bay(BAY_1), bay(BAY_2)];
      const bookings = [booking({ serviceBayId: BAY_1, technicianId: TECH_1 })];

      expect(() => allocate({ bays, bookings })).toThrow(NoTechnicianAvailableError);
    });

    it('does not fall back to a free but unqualified technician', () => {
      const bays = [bay(BAY_1), bay(BAY_2)];
      const technicians = [technician(TECH_1), technician(TECH_2, [TYRES])];
      const bookings = [booking({ serviceBayId: BAY_1, technicianId: TECH_1 })];

      expect(() => allocate({ bays, technicians, bookings })).toThrow(NoTechnicianAvailableError);
    });

    it('picks another qualified technician when one is busy', () => {
      const bays = [bay(BAY_1), bay(BAY_2)];
      const technicians = [technician(TECH_1), technician(TECH_2)];
      const bookings = [booking({ serviceBayId: BAY_1, technicianId: TECH_1 })];

      expect(allocate({ bays, technicians, bookings })).toEqual({
        serviceBayId: BAY_2,
        technicianId: TECH_2,
      });
    });

    it('reports NO_TECHNICIAN_AVAILABLE', () => {
      expect(new NoTechnicianAvailableError().code).toBe('NO_TECHNICIAN_AVAILABLE');
    });
  });

  describe('which bookings count (BR-9)', () => {
    it('ignores a cancelled booking', () => {
      const bookings = [booking({ status: AppointmentStatus.Cancelled })];

      expect(allocate({ bookings })).toEqual({ serviceBayId: BAY_1, technicianId: TECH_1 });
    });

    it('ignores a booking of another dealership', () => {
      const bookings = [booking({ dealershipId: OTHER_DEALERSHIP })];

      expect(allocate({ bookings })).toEqual({ serviceBayId: BAY_1, technicianId: TECH_1 });
    });
  });

  describe('deterministic choice (BR-11)', () => {
    it('picks the lowest-id free bay regardless of input order', () => {
      expect(allocate({ bays: [bay(BAY_2), bay(BAY_1)] }).serviceBayId).toBe(BAY_1);
    });

    it('picks the technician with the fewest appointments that day', () => {
      const technicians = [technician(TECH_1), technician(TECH_2)];
      const technicianDayLoad = new Map([
        [TECH_1, 3],
        [TECH_2, 1],
      ]);

      expect(allocate({ technicians, technicianDayLoad }).technicianId).toBe(TECH_2);
    });

    it('counts a technician missing from the day load as having none', () => {
      const technicians = [technician(TECH_1), technician(TECH_2)];
      const technicianDayLoad = new Map([[TECH_1, 1]]);

      expect(allocate({ technicians, technicianDayLoad }).technicianId).toBe(TECH_2);
    });

    it('breaks a load tie by lowest technician id regardless of input order', () => {
      const technicians = [technician(TECH_2), technician(TECH_1)];
      const technicianDayLoad = new Map([
        [TECH_1, 2],
        [TECH_2, 2],
      ]);

      expect(allocate({ technicians, technicianDayLoad }).technicianId).toBe(TECH_1);
    });

    it('prefers a free busier technician over a busy less-loaded one', () => {
      const bays = [bay(BAY_1), bay(BAY_2)];
      const technicians = [technician(TECH_1), technician(TECH_2)];
      const technicianDayLoad = new Map([
        [TECH_1, 0],
        [TECH_2, 5],
      ]);
      const bookings = [booking({ serviceBayId: BAY_1, technicianId: TECH_1 })];

      expect(allocate({ bays, technicians, technicianDayLoad, bookings })).toEqual({
        serviceBayId: BAY_2,
        technicianId: TECH_2,
      });
    });

    it('does not reorder the caller’s arrays', () => {
      const bays = [bay(BAY_2), bay(BAY_1)];
      const technicians = [technician(TECH_2), technician(TECH_1)];

      allocate({ bays, technicians });

      expect(bays.map((b) => b.id)).toEqual([BAY_2, BAY_1]);
      expect(technicians.map((t) => t.id)).toEqual([TECH_2, TECH_1]);
    });
  });
});
