import { Logger } from '@nestjs/common';
import { PrismaService } from '../shared/infrastructure/prisma/prisma.service';

export const DB_HEALTH_TIMEOUT_MS = 2_000;

/** Answers "can we reach the database right now?" without ever throwing. Built by HealthModule's factory. */
export class DatabaseHealthIndicator {
  private readonly logger = new Logger(DatabaseHealthIndicator.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly timeoutMs: number = DB_HEALTH_TIMEOUT_MS,
  ) {}

  async isUp(): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`timed out after ${this.timeoutMs} ms`)),
        this.timeoutMs,
      );
    });
    try {
      await Promise.race([this.prisma.$queryRaw`SELECT 1`, timeout]);
      return true;
    } catch (error) {
      this.logger.warn(`Database health check failed: ${(error as Error).message}`);
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}
