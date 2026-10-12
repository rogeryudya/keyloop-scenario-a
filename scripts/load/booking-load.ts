/**
 * Light load check (M5): fires N booking requests at once (default 200) at one dealership, all on a few
 * overlapping 30-minute slots, then reads the day's appointments back and checks that nothing is
 * double-booked (FR-5, BR-10) and that every 201 matches a stored appointment.
 *
 * Needs a running API with seed data (`docker compose --profile app up`, or dev mode).
 * Usage: pnpm load:booking [requests]        BASE_URL defaults to http://localhost:3000
 * Each run books a random far-future day, so runs don't interfere. Exit code 1 if a check fails.
 */
import { performance } from 'node:perf_hooks';
import seed from '../../prisma/seed/data.json';
import { BookedAppointment, findDoubleBookings, percentile } from './booking-load-check';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const BANGKOK = '10000000-0000-4000-8000-000000000001'; // Asia/Bangkok, UTC+7, 3 bays
const OFFSET = '+07:00';
/** Eight 30-minute slots 15 minutes apart: neighbours overlap, so requests compete for resources. */
const START_TIMES = ['09:00', '09:15', '09:30', '09:45', '10:00', '10:15', '10:30', '10:45'];

interface Outcome {
  readonly status: number | 'network-error';
  readonly code?: string;
  readonly ms: number;
}

interface ListPage {
  readonly data: BookedAppointment[];
  readonly meta: { readonly nextCursor: string | null };
}

/** A random day 1–8 years ahead (YYYY-MM-DD), so each run starts from an empty calendar. */
function farFutureDay(): string {
  const days = 365 + Math.floor(Math.random() * 7 * 365);
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

async function book(body: object): Promise<Outcome> {
  const started = performance.now();
  try {
    const res = await fetch(`${BASE_URL}/v1/appointments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as { error?: { code?: string } };
    return { status: res.status, code: json.error?.code, ms: performance.now() - started };
  } catch {
    return { status: 'network-error', ms: performance.now() - started };
  }
}

async function appointmentsOn(day: string): Promise<BookedAppointment[]> {
  const all: BookedAppointment[] = [];
  const next = new Date(Date.parse(`${day}T00:00:00${OFFSET}`) + 86_400_000).toISOString();
  let cursor: string | null = null;
  do {
    const query = new URLSearchParams({
      dealershipId: BANGKOK,
      from: `${day}T00:00:00${OFFSET}`,
      to: next,
      limit: '100',
      ...(cursor !== null && { cursor }),
    });
    const res = await fetch(`${BASE_URL}/v1/appointments?${query.toString()}`);
    if (!res.ok) throw new Error(`listing appointments failed: HTTP ${res.status}`);
    const page = (await res.json()) as ListPage;
    all.push(...page.data);
    cursor = page.meta.nextCursor;
  } while (cursor !== null);
  return all;
}

async function main(requests: number): Promise<boolean> {
  const day = farFutureDay();
  const oilChange = seed.serviceTypes.find((t) => t.code === 'OIL_CHANGE');
  if (!oilChange) throw new Error('seed has no OIL_CHANGE service type');
  const bodies = Array.from({ length: requests }, (_, i) => {
    const vehicle = seed.vehicles[i % seed.vehicles.length];
    const start = START_TIMES[i % START_TIMES.length];
    if (!vehicle || !start) throw new Error('unreachable: indexes are taken modulo length');
    return {
      customerId: vehicle.customerId,
      vehicleId: vehicle.id,
      dealershipId: BANGKOK,
      serviceTypeId: oilChange.id,
      start: `${day}T${start}:00${OFFSET}`,
    };
  });

  console.log(`Firing ${requests} concurrent bookings at ${BASE_URL} (Bangkok, ${day})…`);
  const wallStart = performance.now();
  const outcomes = await Promise.all(bodies.map(book));
  const wallMs = performance.now() - wallStart;

  const byOutcome = new Map<string, number>();
  for (const o of outcomes) {
    const key = o.code === undefined ? String(o.status) : `${o.status} ${o.code}`;
    byOutcome.set(key, (byOutcome.get(key) ?? 0) + 1);
  }
  const latencies = outcomes.map((o) => o.ms);
  const created = outcomes.filter((o) => o.status === 201).length;
  const stored = await appointmentsOn(day);
  const confirmed = stored.filter((a) => a.status === 'CONFIRMED');
  const doubleBookings = findDoubleBookings(stored);
  const serverErrors = outcomes.filter((o) => o.status === 'network-error' || o.status >= 500);

  const ms = (value: number): string => `${Math.round(value)} ms`;
  console.log('\nResponses');
  for (const [key, count] of [...byOutcome].sort()) console.log(`  ${key.padEnd(34)} ${count}`);
  console.log('\nLatency (per request, all at once)');
  for (const p of [50, 95, 99, 100]) {
    console.log(`  p${String(p).padEnd(4)} ${ms(percentile(latencies, p))}`);
  }
  console.log(`  wall time ${ms(wallMs)} (${Math.round((requests / wallMs) * 1000)} req/s)`);

  const checks: [string, boolean][] = [
    ['no 5xx or network errors', serverErrors.length === 0],
    [
      `every 201 is stored (201: ${created}, confirmed: ${confirmed.length})`,
      created === confirmed.length,
    ],
    [`no double-booking (overlaps found: ${doubleBookings.length})`, doubleBookings.length === 0],
  ];
  console.log('\nChecks');
  for (const [name, ok] of checks) console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  for (const d of doubleBookings)
    console.log(`  overlap on ${d.resource} ${d.resourceId}: ${d.appointmentIds.join(', ')}`);
  return checks.every(([, ok]) => ok);
}

const requests = Number(process.argv[2] ?? 200);
if (!Number.isInteger(requests) || requests < 1) {
  console.error('requests must be a positive integer');
  process.exitCode = 1;
} else {
  main(requests).then(
    (ok) => {
      process.exitCode = ok ? 0 : 1;
    },
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    },
  );
}
