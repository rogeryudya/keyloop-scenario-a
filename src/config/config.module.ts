import { Global, Module } from '@nestjs/common';
import { AppConfig } from './app-config';
import { DbCredentialsProvider } from './db-credentials.provider';
import { loadAppConfig } from './load-env';

@Global()
@Module({
  providers: [{ provide: AppConfig, useFactory: loadAppConfig }, DbCredentialsProvider],
  exports: [AppConfig, DbCredentialsProvider],
})
export class AppConfigModule {}
