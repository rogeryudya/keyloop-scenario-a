# Seed data

[`data.json`](data.json) is the mock reference data loaded by `pnpm db:seed` (script built in M1). It's for **local runs and demos only**. Automated tests build their own data with builders (see `docs/testing/README.md`).

## Contents
| Entity | Count | Notes |
|---|---|---|
| Dealerships | 3 | Bangkok (Asia/Bangkok, 08–18, 3 bays), Ho Chi Minh City (Asia/Ho_Chi_Minh, 08–17, 2 bays), Hanoi Express (Asia/Ho_Chi_Minh, 09–17, **1 bay**) |
| Service bays | 6 | |
| Service types | 7 | 30–180 min; global (not per dealership) |
| Technicians | 9 | Qualifications deliberately uneven (see scenarios) |
| Customers | 6 | 3 in Thailand, 3 in Vietnam |
| Vehicles | 8 | Thai and Vietnamese plates, incl. two EVs (Tesla, VinFast) |
| Demo appointments | 3 | Placed relative to "tomorrow", so the demo never goes stale |

IDs are fixed UUIDs with a readable prefix per type, so demo requests and docs can reference them:

| Prefix | Type |
|---|---|
| `10000000-…` | Dealership |
| `20000000-…` | Service bay (`…0101` = dealership 1, bay 1) |
| `30000000-…` | Technician (`…0104` = dealership 1, technician 4) |
| `40000000-…` | Service type |
| `50000000-…` | Customer |
| `60000000-…` | Vehicle |
| `70000000-…` | Demo appointment |

## Time zones
Both countries are UTC+7 with no daylight saving. The API still takes and returns ISO-8601 with offsets and stores UTC, so the code stays correct for any zone (unit tests cover a DST zone; see M1).

## Seed script rules (for M1)
- **Idempotent:** upsert by `id`; running it twice changes nothing.
- Technician qualifications are given as service type `code`s; resolve them to ids.
- Demo appointments: `start` = `dayOffset` days from today at `localStart` **in the dealership's time zone**, converted to UTC; `end` = start + the service type's duration; `status` defaults to `CONFIRMED`. Re-running the seed moves them to the new "tomorrow".
- Validate before inserting: every reference exists, technicians are qualified for their demo appointment, and demo appointments fit within opening hours. Fail loudly otherwise.

## Demo scenarios
Use "tomorrow" in the dealership's local time. Each scenario shows one business rule from `docs/requirements.md`.

| # | Request | Expected | Rule |
|---|---|---|---|
| 1 | Somsak (`…5…0001`) books **OIL_CHANGE** for his Corolla Altis (`…6…0001`) at **Bangkok** 11:00 | 201, a bay and Anong or Boonsong assigned | FR-1–3 |
| 2 | Tuan (`…5…0006`) books **OIL_CHANGE** for his Accent (`…6…0008`) at **Hanoi** 10:00 | 409 `NO_SERVICE_BAY_AVAILABLE` (the only bay is taken by demo appointment 1) | BR-7 |
| 3 | Same as #2 at **10:30** | 201: back-to-back is allowed (half-open intervals) | BR-2 |
| 4 | Prasit (`…5…0003`) books **TRANSMISSION_REPAIR** for his BMW (`…6…0004`) at **Bangkok** 09:30 | 409 `NO_TECHNICIAN_AVAILABLE`: bays are free, but Decha (the only qualified technician) is busy 09:00–10:30 | BR-8 |
| 5 | Same as #4 at **10:30** | 201 with Decha assigned | BR-2, BR-8 |
| 6 | Any customer books **EV_BATTERY_CHECK** or **TRANSMISSION_REPAIR** at **Hanoi** | 422 `SERVICE_TYPE_NOT_SUPPORTED` (no qualified technician there) | BR-6 |
| 7 | Malee (`…5…0002`) books with Somsak's Tesla (`…6…0002`) | 422 `VEHICLE_NOT_OWNED_BY_CUSTOMER` | BR-5 |
| 8 | **ANNUAL_SERVICE** (120 min) at **Ho Chi Minh City** 15:30 | 422 `OUTSIDE_OPENING_HOURS` (would end 17:30, closes 17:00) | BR-4 |
| 9 | Tuan (`…5…0006`) books **OIL_CHANGE** for his Accent (`…6…0008`) at **Hanoi** 14:00 | 201: the only bay's appointment at that time is `CANCELLED`, so it doesn't block | BR-9 |
| 10 | Fire #2's request at **11:00** 10× in parallel | Exactly 1 × 201, 9 × 409 | FR-5, BR-10 |
| 11 | Any booking with a start time in the past | 422 `APPOINTMENT_IN_PAST` | BR-3 |

These become `test/http/*.http` demo files in M6.
