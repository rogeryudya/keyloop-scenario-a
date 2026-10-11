import { InvalidEnvironmentError } from './env.schema';
import { loadAppConfig } from './load-env';

describe('loadAppConfig', () => {
  it('builds typed config from the given env', () => {
    const config = loadAppConfig({
      NODE_ENV: 'test',
      PORT: '4000',
      DATABASE_URL: 'postgres://u:p@h/db',
    });

    expect(config.port).toBe(4000);
    expect(config.nodeEnv).toBe('test');
    expect(config.databaseUrl).toBe('postgres://u:p@h/db');
  });

  it('fails fast on invalid env', () => {
    expect(() => loadAppConfig({ NODE_ENV: 'test' })).toThrow(InvalidEnvironmentError);
  });
});
