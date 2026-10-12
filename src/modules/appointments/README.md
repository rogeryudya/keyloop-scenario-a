# appointments module

Booking (M2), availability and lifecycle (M3). Layer rules: [docs/architecture](../../../docs/architecture/README.md).

## Ports
| Port | Layer | Adapter | Purpose |
|---|---|---|---|
| `AppointmentRepository` | `domain/` | `PrismaAppointmentRepository` | Save/load the aggregate; overlapping `CONFIRMED` appointments; per-technician day load (BR-11) |
| `BookableResources` | `application/ports/` | `PrismaBookableResources` | Dealership + opening hours, service type duration, bays and qualified technicians |

## Decision: reference data via a read adapter, not the dealerships module's QueryBus
`BookableResources` is implemented by a read-only Prisma adapter in this module's `infrastructure/`
that reads the `dealerships`, `service_types`, `service_bays`, `technicians` and
`technician_qualifications` tables directly.

Why not dispatch queries to the `dealerships` module:
- **Same transaction.** The check-and-reserve must run inside the booking command's transaction
  (A-8, BR-10). The adapter uses the CLS transaction host, so its reads join it with no extra wiring.
- **No public surface for staff data.** Bays and technicians are deliberately not exposed by the
  dealerships module (A-12). Adding internal queries only for this module would widen it for one caller.
- **Read-only reference data (A-2).** Nothing else writes these tables at runtime, so there's no
  write-side invariant for the dealerships module to protect.

What still holds: no code from `dealerships/domain` or `dealerships/infrastructure` is imported (lint enforced).
If reference data ever gets write use cases, revisit this and expose a read port from `dealerships/application`.
