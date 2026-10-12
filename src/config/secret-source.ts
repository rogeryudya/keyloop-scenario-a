import {
  GetSecretValueCommand,
  ResourceNotFoundException,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import { AppConfig } from './app-config';

/** Reads a secret's string value. Port so `DbCredentialsProvider` is unit-testable without AWS. */
export abstract class SecretSource {
  abstract getSecretString(secretId: string): Promise<string>;
}

export class SecretNotFoundError extends Error {
  constructor(secretId: string) {
    super(`DB secret "${secretId}" not found in Secrets Manager`);
    this.name = 'SecretNotFoundError';
  }
}

/**
 * AWS Secrets Manager (floci locally). Region and endpoint come from `AppConfig`; credentials from the
 * standard AWS chain. With no endpoint set the SDK talks to real AWS, so there is no `if local` branch.
 */
export class SecretsManagerSecretSource extends SecretSource {
  constructor(private readonly client: SecretsManagerClient) {
    super();
  }

  static fromConfig(config: AppConfig): SecretsManagerSecretSource {
    return new SecretsManagerSecretSource(
      new SecretsManagerClient({
        region: config.awsRegion,
        endpoint: config.awsEndpointUrl,
        // Fail the boot quickly when Secrets Manager is unreachable instead of hanging.
        requestHandler: { connectionTimeout: 3_000, requestTimeout: 5_000 },
      }),
    );
  }

  async getSecretString(secretId: string): Promise<string> {
    let secretString: string | undefined;
    try {
      ({ SecretString: secretString } = await this.client.send(
        new GetSecretValueCommand({ SecretId: secretId }),
      ));
    } catch (error) {
      if (error instanceof ResourceNotFoundException) throw new SecretNotFoundError(secretId);
      const reason = error instanceof Error ? error.name : 'unknown error';
      throw new Error(`Could not read DB secret "${secretId}" from Secrets Manager: ${reason}`, {
        cause: error,
      });
    }
    if (secretString === undefined) {
      throw new Error(
        `DB secret "${secretId}" has no SecretString (binary secrets are not supported)`,
      );
    }
    return secretString;
  }
}
