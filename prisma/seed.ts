// `pnpm db:seed` entry point (run by `prisma db seed` via tsx). Rules: prisma/seed/README.md.
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import data from './seed/data.json';
import { buildSeedPlan } from './seed/seed-plan';
import { writeSeed } from './seed/write-seed';

async function main(): Promise<void> {
  // M4 resolves DB_SECRET_ID here, like `pnpm db:migrate`; until then DATABASE_URL comes from .env.
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not set');

  const plan = buildSeedPlan(data, new Date());
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  try {
    await writeSeed(prisma, plan);
  } finally {
    await prisma.$disconnect();
  }

  console.log(
    `db:seed: ${plan.dealerships.length} dealerships, ${plan.serviceBays.length} bays, ` +
      `${plan.technicians.length} technicians, ${plan.serviceTypes.length} service types, ` +
      `${plan.customers.length} customers, ${plan.vehicles.length} vehicles, ` +
      `${plan.appointments.length} demo appointments`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
