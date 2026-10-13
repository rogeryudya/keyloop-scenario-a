/** Pure helpers for the booking load check (`booking-load.ts`), unit-tested in `test/load/`. */

export interface BookedAppointment {
  readonly id: string;
  readonly status: string;
  readonly start: string;
  readonly end: string;
  readonly serviceBay: { readonly id: string };
  readonly technician: { readonly id: string };
}

export interface DoubleBooking {
  readonly resource: 'serviceBay' | 'technician';
  readonly resourceId: string;
  readonly appointmentIds: readonly [string, string];
}

/** Nearest-rank percentile (p in 0..100) of unsorted samples; NaN for no samples. */
export function percentile(samples: readonly number[], p: number): number {
  if (samples.length === 0) return Number.NaN;
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[Math.min(rank, sorted.length) - 1] ?? Number.NaN;
}

/**
 * Every pair of CONFIRMED appointments that overlap on the same bay or technician (BR-10).
 * Intervals are half-open (BR-2), so back-to-back is not an overlap.
 */
export function findDoubleBookings(appointments: readonly BookedAppointment[]): DoubleBooking[] {
  const confirmed = appointments.filter((a) => a.status === 'CONFIRMED');
  const found: DoubleBooking[] = [];
  for (const resource of ['serviceBay', 'technician'] as const) {
    const byResource = new Map<string, BookedAppointment[]>();
    for (const a of confirmed) {
      const id = a[resource].id;
      byResource.set(id, [...(byResource.get(id) ?? []), a]);
    }
    for (const [resourceId, list] of byResource) {
      const sorted = [...list].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
      sorted.forEach((a, i) => {
        for (const b of sorted.slice(i + 1)) {
          if (Date.parse(b.start) >= Date.parse(a.end)) break;
          found.push({ resource, resourceId, appointmentIds: [a.id, b.id] });
        }
      });
    }
  }
  return found;
}
