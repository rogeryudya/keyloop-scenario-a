import { Global, Module } from '@nestjs/common';
import { AppConfig } from './app-config';
import { DbCredentialsProvider } from './db-credentials.provider';
import { loadAppConfig } from './load-env';
import { SecretSource, SecretsManagerSecretSource } from './secret-source';

@Global()
@Module({
  providers: [
    { provide: AppConfig, useFactory: loadAppConfig },
    {
      provide: SecretSource,
      inject: [AppConfig],
      useFactory: (config: AppConfig) => SecretsManagerSecretSource.fromConfig(config),
    },
    DbCredentialsProvider,
  ],
  exports: [AppConfig, DbCredentialsProvider],
})
export class AppConfigModule {}
