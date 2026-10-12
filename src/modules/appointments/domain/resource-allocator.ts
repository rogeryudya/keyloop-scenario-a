import { TimeSlot } from '../../../shared/domain/time-slot';
import { AppointmentStatus } from './appointment-status';
import { AppointmentProps } from './appointment.entity';
import {
  NoServiceBayAvailableError,
  NoTechnicianAvailableError,
  ServiceTypeNotSupportedError,
} from './appointment.errors';

export interface BayCandidate {
  readonly id: string;
  readonly dealershipId: string;
}

export interface TechnicianCandidate {
  readonly id: string;
  readonly dealershipId: string;
  readonly serviceTypeIds: readonly string[];
}

/** The parts of an existing appointment that decide whether it occupies a bay or technician. */
export type ExistingBooking = Pick<
  AppointmentProps,
  'dealershipId' | 'serviceBayId' | 'technicianId' | 'slot' | 'status'
>;

export interface AllocationRequest {
  readonly dealershipId: string;
  readonly serviceTypeId: string;
  readonly slot: TimeSlot;
  readonly bays: readonly BayCandidate[];
  readonly technicians: readonly TechnicianCandidate[];
  readonly bookings: readonly ExistingBooking[];
  /** Appointments per technician on the slot's local day (BR-11); a missing id counts as 0. */
  readonly technicianDayLoad: ReadonlyMap<string, number>;
}

export interface Allocation {
  readonly serviceBayId: string;
  readonly technicianId: string;
}

const byId = (a: { id: string }, b: { id: string }): number =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/**
 * Picks a free bay and a free qualified technician for `slot` (BR-6/7/8), deterministically (BR-11).
 * Pure: the caller loads candidates and bookings. Inputs from other dealerships, unqualified
 * technicians and non-confirmed bookings (BR-9) are ignored, so a loose query can't cause a
 * double booking. When neither a bay nor a technician is free, the bay error wins (A-13).
 */
export const ResourceAllocator = {
  allocate(request: AllocationRequest): Allocation {
    const { dealershipId, serviceTypeId, slot } = request;

    const qualified = request.technicians.filter(
      (t) => t.dealershipId === dealershipId && t.serviceTypeIds.includes(serviceTypeId),
    );
    if (qualified.length === 0) throw new ServiceTypeNotSupportedError(); // BR-6

    const blocking = request.bookings.filter(
      (b) =>
        b.dealershipId === dealershipId &&
        b.status === AppointmentStatus.Confirmed && // BR-9
        b.slot.overlaps(slot),
    );
    const busyBays = new Set(blocking.map((b) => b.serviceBayId));
    const busyTechnicians = new Set(blocking.map((b) => b.technicianId));

    const bay = request.bays
      .filter((b) => b.dealershipId === dealershipId && !busyBays.has(b.id))
      .sort(byId)[0];
    if (!bay) throw new NoServiceBayAvailableError(); // BR-7

    const load = (id: string): number => request.technicianDayLoad.get(id) ?? 0;
    const technician = qualified
      .filter((t) => !busyTechnicians.has(t.id))
      .sort((a, b) => load(a.id) - load(b.id) || byId(a, b))[0];
    if (!technician) throw new NoTechnicianAvailableError(); // BR-8

    return { serviceBayId: bay.id, technicianId: technician.id };
  },
};
