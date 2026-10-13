# Milestones

Index and progress tracker. Each milestone has its own file with goal, tasks, acceptance criteria and notes.

**Current milestone:** none. M0–M7 are delivered; M4 and M5 each have one task waiting on the repo owner (below).

M4 and M5 stay `in-progress` until their last task is unblocked by the repo owner: branch protection + Bugbot (M4), a Datadog trial-key check (M5). See their Notes.

| # | Milestone | Covers | Status |
|---|---|---|---|
| M0 | [Foundation](m0-foundation.md) | Scaffold, architecture skeleton, test infra, basic CI | `done` |
| M1 | [Domain model and reference data](m1-domain-model.md) | TimeSlot, OpeningHours, Appointment, schema + exclusion constraints, seed, FR-10 | `done` |
| M2 | [Booking with availability check](m2-booking.md) | **FR-1 … FR-6**: the core of the brief, incl. concurrency | `done` |
| M3 | [Availability query and lifecycle](m3-availability-lifecycle.md) | FR-7 availability, FR-8 cancel, FR-9 list, FR-11 idempotency | `done` |
| M4 | [AWS-like environment and full CI](m4-environment.md) | floci + Terraform, Secrets Manager, full-stack Compose, Bugbot | `in-progress` |
| M5 | [Observability and quality](m5-observability-quality.md) | OpenTelemetry, logs, metrics, coverage, load check | `in-progress` |
| M6 | [Delivery](m6-delivery.md) | README, design notes, clean-machine check | `done` |
| M7 | [Cloud-ready infra (stretch)](m7-cloud-infra.md) | ECR + ECS on floci | `done` |

**Priority if time runs short:** M0 → M1 → M2 are essential (they implement the brief). Then M6 (a reviewer must be able to run it), then M3, M4, M5. M7 is optional.

## Rules
- Work milestones in order; inside a milestone, one task at a time, top to bottom.
- Tick `[x]` when a task meets the Definition of Done in `CLAUDE.md`.
- Status values: `todo` · `in-progress` · `done`. When a status changes, update it **both** here and in the milestone file, and move the "Current milestone" link.
- Record anything learned mid-milestone (gotchas, deferred work) in that file's **Notes** section.
- New milestone: copy [_template.md](_template.md), name it `mN-short-name.md`, add a row above.
