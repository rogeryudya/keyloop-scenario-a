import { OpeningHours } from '../../../shared/domain/opening-hours';
import { TimeSlot } from '../../../shared/domain/time-slot';
import {
  NoServiceBayAvailableError,
  NoTechnicianAvailableError,
  ServiceTypeNotSupportedError,
} from './appointment.errors';
import {
  BayCandidate,
  ExistingBooking,
  ResourceAllocator,
  TechnicianCandidate,
} from './resource-allocator';

/** A-9: offered start times are this far apart, counted from opening time (A-14). */
export const AVAILABILITY_STEP_MINUTES = 15;

const MS_PER_MINUTE = 60_000;

export interface AvailabilityRequest {
  readonly dealershipId: string;
  readonly serviceTypeId: string;
  readonly durationMinutes: number;
  /** Local calendar date `YYYY-MM-DD` in the dealership's time zone (A-14). */
  readonly date: string;
  readonly openingHours: OpeningHours;
  readonly now: Date;
  readonly bays: readonly BayCandidate[];
  readonly technicians: readonly TechnicianCandidate[];
  /** At least every booking overlapping the day's opening window. */
  readonly bookings: readonly ExistingBooking[];
}

/** Day load only decides which technician is picked (BR-11), never whether one is free. */
const NO_DAY_LOAD: ReadonlyMap<string, number> = new Map();

/**
 * FR-7: the slots on `date` a booking would currently succeed for. Walks the opening window in
 * steps and keeps each slot that is in the future (BR-3), fits the opening hours (BR-4) and that
 * `ResourceAllocator` can staff (BR-6/7/8/9), so availability and booking can't disagree.
 * Pure and in-memory: the caller loads the day's bookings once.
 */
export const Availability = {
  slotsOn(request: AvailabilityRequest): TimeSlot[] {
    const { dealershipId, serviceTypeId, openingHours, now } = request;
    const supported = request.technicians.some(
      (t) => t.dealershipId === dealershipId && t.serviceTypeIds.includes(serviceTypeId),
    );
    if (!supported) throw ServiceTypeNotSupportedError.forAvailability(); // BR-6

    const window = openingHours.windowOn(request.date);
    const slots: TimeSlot[] = [];
    for (
      let startMs = window.start.getTime();
      startMs < window.end.getTime();
      startMs += AVAILABILITY_STEP_MINUTES * MS_PER_MINUTE
    ) {
      const slot = TimeSlot.fromStartAndDuration(new Date(startMs), request.durationMinutes);
      if (startMs <= now.getTime()) continue; // BR-3, same rule as booking
      if (!openingHours.contains(slot)) continue; // BR-4
      if (canStaff({ ...request, slot })) slots.push(slot);
    }
    return slots;
  },
};

function canStaff(request: AvailabilityRequest & { slot: TimeSlot }): boolean {
  try {
    ResourceAllocator.allocate({ ...request, technicianDayLoad: NO_DAY_LOAD });
    return true;
  } catch (error) {
    if (
      error instanceof NoServiceBayAvailableError ||
      error instanceof NoTechnicianAvailableError
    ) {
      return false;
    }
    throw error;
  }
}
