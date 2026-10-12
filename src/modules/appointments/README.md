# appointments module

Booking (M2), availability and lifecycle (M3). Layer rules: [docs/architecture](../../../docs/architecture/README.md).

## Ports
| Port | Layer | Adapter | Purpose |
|---|---|---|---|
| `AppointmentRepository` | `domain/` | `PrismaAppointmentRepository` | Save/load the aggregate; overlapping `CONFIRMED` appointments; per-technician day load (BR-11) |
| `BookableResources` | `application/ports/` | `PrismaBookableResources` | Dealership + opening hours, service type duration, bays and qualified technicians |
| `BookingParties` | `application/ports/` | `PrismaBookingParties` | Customer exists; vehicle owner (BR-5, BR-13) |

## Decision: reference data via read adapters, not the other modules' QueryBus
`BookableResources` and `BookingParties` are implemented by read-only Prisma adapters in this module's
`infrastructure/` that read the `dealerships`, `service_types`, `service_bays`, `technicians`,
`technician_qualifications`, `customers` and `vehicles` tables directly.

Why not dispatch queries to the `dealerships` / `customers` modules:
- **Same transaction.** The check-and-reserve must run inside the booking command's transaction
  (A-8, BR-10). The adapters use the CLS transaction host, so their reads join it with no extra wiring.
- **No public surface for staff data.** Bays and technicians are deliberately not exposed by the
  dealerships module (A-12). Adding internal queries only for this module would widen it for one caller.
- **Read-only reference data (A-2).** Nothing else writes these tables at runtime, so there's no
  write-side invariant for the owning modules to protect.

What still holds: no code from another module's `domain/` or `infrastructure/` is imported (lint enforced).
If reference data ever gets write use cases, revisit this and expose read ports from those modules' `application/`.
