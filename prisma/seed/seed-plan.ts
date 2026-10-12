import { OpeningHours } from '../../src/shared/domain/opening-hours';
import { TimeSlot } from '../../src/shared/domain/time-slot';

/** Shape of `prisma/seed/data.json`. */
export interface SeedData {
  readonly dealerships: readonly {
    readonly id: string;
    readonly name: string;
    readonly timeZone: string;
    readonly opensAt: string;
    readonly closesAt: string;
  }[];
  readonly serviceBays: readonly {
    readonly id: string;
    readonly dealershipId: string;
    readonly name: string;
  }[];
  readonly serviceTypes: readonly {
    readonly id: string;
    readonly code: string;
    readonly name: string;
    readonly durationMinutes: number;
  }[];
  readonly technicians: readonly {
    readonly id: string;
    readonly dealershipId: string;
    readonly name: string;
    readonly qualifications: readonly string[];
  }[];
  readonly customers: readonly {
    readonly id: string;
    readonly firstName: string;
    readonly lastName: string;
    readonly email: string;
    readonly phone?: string | null;
  }[];
  readonly vehicles: readonly {
    readonly id: string;
    readonly customerId: string;
    readonly vin: string;
    readonly registration: string;
    readonly make: string;
    readonly model: string;
    readonly year: number;
  }[];
  readonly demoAppointments: readonly {
    readonly id: string;
    readonly description?: string;
    readonly dealershipId: string;
    readonly serviceBayId: string;
    readonly technicianId: string;
    readonly serviceTypeCode: string;
    readonly customerId: string;
    readonly vehicleId: string;
    /** Days from today, in the dealership's time zone. */
    readonly dayOffset: number;
    /** Local wall-clock start `HH:mm`. */
    readonly localStart: string;
    readonly status?: string;
  }[];
}

export type SeedStatus = 'CONFIRMED' | 'CANCELLED';

/** Validated rows, ready to upsert. Times are resolved to UTC instants. */
export interface SeedPlan {
  readonly dealerships: readonly {
    id: string;
    name: string;
    timeZone: string;
    /** `time` column: only the UTC time-of-day is stored. */
    opensAt: Date;
    closesAt: Date;
  }[];
  readonly serviceBays: SeedData['serviceBays'];
  readonly serviceTypes: SeedData['serviceTypes'];
  readonly technicians: readonly { id: string; dealershipId: string; name: string }[];
  readonly qualifications: readonly { technicianId: string; serviceTypeId: string }[];
  readonly customers: readonly {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
  }[];
  readonly vehicles: SeedData['vehicles'];
  readonly appointments: readonly {
    id: string;
    dealershipId: string;
    serviceBayId: string;
    technicianId: string;
    serviceTypeId: string;
    customerId: string;
    vehicleId: string;
    startAt: Date;
    endAt: Date;
    status: SeedStatus;
    cancelledAt: Date | null;
  }[];
}

export class SeedValidationError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`Seed data is invalid:\n- ${problems.join('\n- ')}`);
    this.name = 'SeedValidationError';
  }
}

const WALL_CLOCK = /^(\d{2}):(\d{2})$/;
const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const STATUSES: readonly string[] = ['CONFIRMED', 'CANCELLED'];

/**
 * Validates the seed data and resolves it to rows (prisma/seed/README.md). Pure: `now` decides
 * "today", so demo appointments always land relative to the current day in each dealership's zone.
 * Throws `SeedValidationError` listing every problem found.
 */
export function buildSeedPlan(data: SeedData, now: Date): SeedPlan {
  const problems: string[] = [];

  const openingHours = new Map<string, OpeningHours>();
  for (const d of data.dealerships) {
    try {
      openingHours.set(d.id, OpeningHours.of(d));
    } catch (error) {
      problems.push(`dealership ${d.id}: ${describe(error)}`);
    }
  }
  const dealershipIds = new Set(data.dealerships.map((d) => d.id));
  const bays = new Map(data.serviceBays.map((b) => [b.id, b]));
  const technicians = new Map(data.technicians.map((t) => [t.id, t]));
  const serviceTypesByCode = new Map(data.serviceTypes.map((s) => [s.code, s]));
  const customerIds = new Set(data.customers.map((c) => c.id));
  const vehicles = new Map(data.vehicles.map((v) => [v.id, v]));

  for (const b of data.serviceBays) {
    if (!dealershipIds.has(b.dealershipId))
      problems.push(`service bay ${b.id}: unknown dealership ${b.dealershipId}`);
  }

  const qualifications: { technicianId: string; serviceTypeId: string }[] = [];
  for (const t of data.technicians) {
    if (!dealershipIds.has(t.dealershipId))
      problems.push(`technician ${t.id}: unknown dealership ${t.dealershipId}`);
    for (const code of t.qualifications) {
      const serviceType = serviceTypesByCode.get(code);
      if (serviceType) qualifications.push({ technicianId: t.id, serviceTypeId: serviceType.id });
      else problems.push(`technician ${t.id}: unknown service type code ${code}`);
    }
  }

  for (const v of data.vehicles) {
    if (!customerIds.has(v.customerId))
      problems.push(`vehicle ${v.id}: unknown customer ${v.customerId}`);
  }

  const appointments: SeedPlan['appointments'][number][] = [];
  for (const a of data.demoAppointments) {
    const where = `demo appointment ${a.id}`;
    const before = problems.length;
    const hours = openingHours.get(a.dealershipId);
    const serviceType = serviceTypesByCode.get(a.serviceTypeCode);
    const bay = bays.get(a.serviceBayId);
    const technician = technicians.get(a.technicianId);
    const vehicle = vehicles.get(a.vehicleId);
    const status = a.status ?? 'CONFIRMED';

    if (!dealershipIds.has(a.dealershipId))
      problems.push(`${where}: unknown dealership ${a.dealershipId}`);
    if (!serviceType) problems.push(`${where}: unknown service type code ${a.serviceTypeCode}`);
    if (!bay) problems.push(`${where}: unknown service bay ${a.serviceBayId}`);
    else if (bay.dealershipId !== a.dealershipId)
      problems.push(`${where}: service bay belongs to another dealership`);
    if (!technician) problems.push(`${where}: unknown technician ${a.technicianId}`);
    else {
      if (technician.dealershipId !== a.dealershipId)
        problems.push(`${where}: technician belongs to another dealership`);
      if (!technician.qualifications.includes(a.serviceTypeCode)) {
        problems.push(`${where}: technician is not qualified for ${a.serviceTypeCode}`);
      }
    }
    if (!customerIds.has(a.customerId)) problems.push(`${where}: unknown customer ${a.customerId}`);
    if (!vehicle) problems.push(`${where}: unknown vehicle ${a.vehicleId}`);
    else if (vehicle.customerId !== a.customerId)
      problems.push(`${where}: vehicle is not owned by the customer`);
    if (!STATUSES.includes(status)) problems.push(`${where}: unknown status ${status}`);
    if (!Number.isInteger(a.dayOffset)) problems.push(`${where}: dayOffset must be an integer`);
    if (!WALL_CLOCK.test(a.localStart)) problems.push(`${where}: localStart must be HH:mm`);
    if (problems.length > before || !hours || !serviceType) continue;

    const day = addDays(localDateOf(now, hours.timeZone), a.dayOffset);
    const slot = TimeSlot.fromStartAndDuration(
      zonedToUtc(day, a.localStart, hours.timeZone),
      serviceType.durationMinutes,
    );
    if (!hours.contains(slot)) {
      problems.push(
        `${where}: ${day} ${a.localStart} + ${serviceType.durationMinutes} min is outside opening hours`,
      );
      continue;
    }
    const cancelled = status === 'CANCELLED';
    appointments.push({
      id: a.id,
      dealershipId: a.dealershipId,
      serviceBayId: a.serviceBayId,
      technicianId: a.technicianId,
      serviceTypeId: serviceType.id,
      customerId: a.customerId,
      vehicleId: a.vehicleId,
      startAt: slot.start,
      endAt: slot.end,
      status: cancelled ? 'CANCELLED' : 'CONFIRMED',
      cancelledAt: cancelled ? now : null,
    });
  }

  if (problems.length > 0) throw new SeedValidationError(problems);

  return {
    dealerships: data.dealerships.map((d) => ({
      id: d.id,
      name: d.name,
      timeZone: d.timeZone,
      opensAt: timeColumn(d.opensAt),
      closesAt: timeColumn(d.closesAt),
    })),
    serviceBays: data.serviceBays,
    serviceTypes: data.serviceTypes,
    technicians: data.technicians.map(({ id, dealershipId, name }) => ({ id, dealershipId, name })),
    qualifications,
    customers: data.customers.map((c) => ({ ...c, phone: c.phone ?? null })),
    vehicles: data.vehicles,
    appointments,
  };
}

/** Calendar date `YYYY-MM-DD` of an instant in a time zone. */
export function localDateOf(instant: Date, timeZone: string): string {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/** The instant at which the wall clock in `timeZone` shows `date` `time`. */
export function zonedToUtc(date: string, time: string, timeZone: string): Date {
  const [year, month, day] = parseDate(date);
  const [hour, minute] = parseTime(time);
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  // Second pass: the offset at the first guess may differ from the offset at the answer (DST change).
  const guess = wallAsUtc - offsetMs(wallAsUtc, timeZone);
  return new Date(wallAsUtc - offsetMs(guess, timeZone));
}

function addDays(date: string, days: number): string {
  const [year, month, day] = parseDate(date);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** UTC offset of `timeZone` at an instant, in ms (e.g. +7h for Asia/Bangkok). */
function offsetMs(instantMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(new Date(instantMs));
  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === type)?.value);
  const wall = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return wall - (instantMs - (instantMs % 1000));
}

function timeColumn(wallClock: string): Date {
  return new Date(`1970-01-01T${wallClock}:00.000Z`);
}

function parseDate(value: string): [number, number, number] {
  const match = LOCAL_DATE.exec(value);
  if (!match) throw new Error(`"${value}" is not a YYYY-MM-DD date`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function parseTime(value: string): [number, number] {
  const match = WALL_CLOCK.exec(value);
  if (!match) throw new Error(`"${value}" is not an HH:mm time`);
  return [Number(match[1]), Number(match[2])];
}

function describe(error: unknown): string {
  if (error instanceof Error && 'details' in error && Array.isArray(error.details)) {
    return `${error.message} ${JSON.stringify(error.details)}`;
  }
  return error instanceof Error ? error.message : String(error);
}
