-- FR-11: Idempotency-Key on POST /v1/appointments (ADR-0007).
-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "idempotency_key" VARCHAR(255),
ADD COLUMN     "request_hash" CHAR(64);

-- CreateIndex
CREATE UNIQUE INDEX "appointments_idempotency_key_key" ON "appointments"("idempotency_key");


-- Key and hash are set together (Prisma can't express CHECK constraints).
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_idempotency_check"
  CHECK (("idempotency_key" IS NULL) = ("request_hash" IS NULL));
