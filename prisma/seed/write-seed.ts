import { PrismaClient } from '../../src/generated/prisma/client';
import { SeedPlan } from './seed-plan';

/**
 * Upserts every row by id in one transaction, parents before children. Idempotent: a second run
 * rewrites the same values, except demo appointments, which move to the new "tomorrow".
 *
 * Demo appointments are deleted and re-inserted rather than upserted. Moving them one by one would trip
 * the exclusion constraints: a day-1 booking moving onto day 2 can overlap a day-2 booking on the same
 * bay that hasn't moved yet. Inside the transaction no other connection sees them missing.
 */
export async function writeSeed(prisma: PrismaClient, plan: SeedPlan): Promise<void> {
  await prisma.$transaction(async (tx) => {
    for (const { id, ...data } of plan.dealerships) {
      await tx.dealership.upsert({ where: { id }, create: { id, ...data }, update: data });
    }
    for (const { id, ...data } of plan.serviceBays) {
      await tx.serviceBay.upsert({ where: { id }, create: { id, ...data }, update: data });
    }
    for (const { id, ...data } of plan.serviceTypes) {
      await tx.serviceType.upsert({ where: { id }, create: { id, ...data }, update: data });
    }
    for (const { id, ...data } of plan.technicians) {
      await tx.technician.upsert({ where: { id }, create: { id, ...data }, update: data });
    }
    await tx.technicianQualification.createMany({
      data: [...plan.qualifications],
      skipDuplicates: true,
    });
    for (const { id, ...data } of plan.customers) {
      await tx.customer.upsert({ where: { id }, create: { id, ...data }, update: data });
    }
    for (const { id, ...data } of plan.vehicles) {
      await tx.vehicle.upsert({ where: { id }, create: { id, ...data }, update: data });
    }
    await tx.appointment.deleteMany({ where: { id: { in: plan.appointments.map((a) => a.id) } } });
    await tx.appointment.createMany({ data: [...plan.appointments] });
  });
}
