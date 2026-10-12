-- CreateEnum
CREATE TYPE "appointment_status" AS ENUM ('CONFIRMED', 'CANCELLED');

-- CreateTable
CREATE TABLE "dealerships" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "time_zone" TEXT NOT NULL,
    "opens_at" TIME(0) NOT NULL,
    "closes_at" TIME(0) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "dealerships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_bays" (
    "id" UUID NOT NULL,
    "dealership_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "service_bays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "technicians" (
    "id" UUID NOT NULL,
    "dealership_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "technicians_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_types" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "service_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "technician_qualifications" (
    "technician_id" UUID NOT NULL,
    "service_type_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "technician_qualifications_pkey" PRIMARY KEY ("technician_id","service_type_id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "vin" CHAR(17) NOT NULL,
    "registration" TEXT NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" SMALLINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" UUID NOT NULL,
    "dealership_id" UUID NOT NULL,
    "service_bay_id" UUID NOT NULL,
    "technician_id" UUID NOT NULL,
    "service_type_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "start_at" TIMESTAMPTZ(6) NOT NULL,
    "end_at" TIMESTAMPTZ(6) NOT NULL,
    "status" "appointment_status" NOT NULL DEFAULT 'CONFIRMED',
    "cancelled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dealerships_name_key" ON "dealerships"("name");

-- CreateIndex
CREATE INDEX "service_bays_dealership_id_idx" ON "service_bays"("dealership_id");

-- CreateIndex
CREATE UNIQUE INDEX "service_bays_dealership_id_name_key" ON "service_bays"("dealership_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "service_bays_id_dealership_id_key" ON "service_bays"("id", "dealership_id");

-- CreateIndex
CREATE INDEX "technicians_dealership_id_idx" ON "technicians"("dealership_id");

-- CreateIndex
CREATE UNIQUE INDEX "technicians_id_dealership_id_key" ON "technicians"("id", "dealership_id");

-- CreateIndex
CREATE UNIQUE INDEX "service_types_code_key" ON "service_types"("code");

-- CreateIndex
CREATE INDEX "technician_qualifications_service_type_id_idx" ON "technician_qualifications"("service_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_vin_key" ON "vehicles"("vin");

-- CreateIndex
CREATE INDEX "vehicles_customer_id_idx" ON "vehicles"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_id_customer_id_key" ON "vehicles"("id", "customer_id");

-- CreateIndex
CREATE INDEX "appointments_dealership_id_created_at_id_idx" ON "appointments"("dealership_id", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "appointments_customer_id_created_at_id_idx" ON "appointments"("customer_id", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "appointments_vehicle_id_idx" ON "appointments"("vehicle_id");

-- CreateIndex
CREATE INDEX "appointments_service_type_id_idx" ON "appointments"("service_type_id");

-- AddForeignKey
ALTER TABLE "service_bays" ADD CONSTRAINT "service_bays_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "dealerships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technicians" ADD CONSTRAINT "technicians_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "dealerships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technician_qualifications" ADD CONSTRAINT "technician_qualifications_technician_id_fkey" FOREIGN KEY ("technician_id") REFERENCES "technicians"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technician_qualifications" ADD CONSTRAINT "technician_qualifications_service_type_id_fkey" FOREIGN KEY ("service_type_id") REFERENCES "service_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "dealerships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_service_bay_id_dealership_id_fkey" FOREIGN KEY ("service_bay_id", "dealership_id") REFERENCES "service_bays"("id", "dealership_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_technician_id_dealership_id_fkey" FOREIGN KEY ("technician_id", "dealership_id") REFERENCES "technicians"("id", "dealership_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_service_type_id_fkey" FOREIGN KEY ("service_type_id") REFERENCES "service_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_technician_id_service_type_id_fkey" FOREIGN KEY ("technician_id", "service_type_id") REFERENCES "technician_qualifications"("technician_id", "service_type_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_vehicle_id_customer_id_fkey" FOREIGN KEY ("vehicle_id", "customer_id") REFERENCES "vehicles"("id", "customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;
