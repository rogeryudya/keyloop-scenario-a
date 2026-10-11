import { Global, Module } from '@nestjs/common';
import { DbCredentialsProvider } from '../../../config/db-credentials.provider';
import { PrismaService } from './prisma.service';

/** Connects at startup so a bad URL or unreachable DB fails the boot, not the first request. */
@Global()
@Module({
  providers: [
    {
      provide: PrismaService,
      inject: [DbCredentialsProvider],
      useFactory: async (credentials: DbCredentialsProvider): Promise<PrismaService> => {
        const prisma = new PrismaService(await credentials.getDatabaseUrl());
        await prisma.verifyConnection();
        return prisma;
      },
    },
  ],
  exports: [PrismaService],
})
export class PrismaModule {}
