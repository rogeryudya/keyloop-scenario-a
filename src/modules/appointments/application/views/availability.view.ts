/**
 * FR-7: the slots a service type can currently be booked in on one local day. `timeZone` lets the
 * API render times with the dealership's offset (A-7).
 */
export type AvailabilityView = Readonly<{
  timeZone: string;
  slots: readonly Readonly<{ start: Date; end: Date }>[];
}>;
