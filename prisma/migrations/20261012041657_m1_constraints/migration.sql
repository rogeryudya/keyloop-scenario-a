-- Constraints Prisma's schema language can't express. Reference: docs/data-dictionary.md.
-- Constraint names are stable: the infrastructure layer maps violations to domain errors by name.

-- No double-booking (BR-10): a bay / technician can't have two overlapping CONFIRMED appointments.
-- '[)' = half-open, so back-to-back is allowed (BR-2); CANCELLED rows don't block (BR-9).
-- Violation: SQLSTATE 23P01.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_no_bay_overlap"
  EXCLUDE USING gist ("service_bay_id" WITH =, tstzrange("start_at", "end_at", '[)') WITH &&)
  WHERE ("status" = 'CONFIRMED');

ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_no_technician_overlap"
  EXCLUDE USING gist ("technician_id" WITH =, tstzrange("start_at", "end_at", '[)') WITH &&)
  WHERE ("status" = 'CONFIRMED');

-- Busy lookups and availability for a day (FR-7).
CREATE INDEX "appointments_confirmed_dealership_id_start_at_idx"
  ON "appointments" ("dealership_id", "start_at")
  WHERE ("status" = 'CONFIRMED');

-- Case-insensitive unique email.
CREATE UNIQUE INDEX "customers_email_lower_key" ON "customers" (lower("email"));

-- CHECK constraints. Violation: SQLSTATE 23514.
ALTER TABLE "dealerships"
  ADD CONSTRAINT "dealerships_opening_hours_check" CHECK ("closes_at" > "opens_at");

ALTER TABLE "service_types"
  ADD CONSTRAINT "service_types_code_check" CHECK ("code" ~ '^[A-Z][A-Z0-9_]*$'),
  ADD CONSTRAINT "service_types_duration_minutes_check"
    CHECK ("duration_minutes" > 0 AND "duration_minutes" % 15 = 0);

ALTER TABLE "vehicles"
  ADD CONSTRAINT "vehicles_vin_check" CHECK ("vin" ~ '^[A-HJ-NPR-Z0-9]{17}$'),
  ADD CONSTRAINT "vehicles_year_check" CHECK ("year" BETWEEN 1950 AND 2100);

ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_time_range_check" CHECK ("end_at" > "start_at"),
  ADD CONSTRAINT "appointments_cancelled_at_check"
    CHECK (("status" = 'CANCELLED') = ("cancelled_at" IS NOT NULL));
