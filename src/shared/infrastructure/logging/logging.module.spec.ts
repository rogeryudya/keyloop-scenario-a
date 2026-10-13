import { IncomingMessage, ServerResponse } from 'node:http';
import { AppConfig } from '../../../config/app-config';
import { validateEnv } from '../../../config/env.schema';
import { levelForStatus, pinoHttpOptions } from './logging.module';

const configWith = (env: Record<string, string>): AppConfig =>
  new AppConfig(validateEnv({ DATABASE_URL: 'postgres://u:p@h/db', ...env }));

describe('levelForStatus', () => {
  it.each([
    [200, 'info'],
    [201, 'info'],
    [399, 'info'],
    [400, 'warn'],
    [409, 'warn'],
    [499, 'warn'],
    [500, 'error'],
    [503, 'error'],
  ])('%i → %s', (status, level) => {
    expect(levelForStatus(status)).toBe(level);
  });

  it('logs a request that failed with an error as error, whatever the status', () => {
    expect(levelForStatus(200, new Error('socket hang up'))).toBe('error');
  });
});

describe('pinoHttpOptions', () => {
  it('uses the configured level', () => {
    expect(pinoHttpOptions(configWith({ LOG_LEVEL: 'debug' })).level).toBe('debug');
  });

  it('does not log health probes', () => {
    const { autoLogging } = pinoHttpOptions(configWith({}));
    const ignore = typeof autoLogging === 'object' ? autoLogging.ignore : undefined;

    expect(ignore?.({ url: '/health' } as IncomingMessage)).toBe(true);
    expect(ignore?.({ url: '/v1/appointments' } as IncomingMessage)).toBe(false);
  });

  it('logs only method, url and status: no headers or bodies', () => {
    const { serializers } = pinoHttpOptions(configWith({}));
    const req = {
      method: 'POST',
      url: '/v1/appointments',
      headers: { authorization: 'secret' },
      raw: { body: { customerId: 'x' } },
    };

    expect(serializers?.req?.(req)).toEqual({ method: 'POST', url: '/v1/appointments' });
    expect(serializers?.res?.({ statusCode: 201, headers: { 'set-cookie': 'x' } })).toEqual({
      statusCode: 201,
    });
  });

  it('binds the request id as request_id', () => {
    const { customProps } = pinoHttpOptions(configWith({}));
    const req = { id: 'req-1' } as IncomingMessage;

    expect(customProps?.(req, {} as ServerResponse)).toEqual({ request_id: 'req-1' });
  });

  it('writes the level as a label', () => {
    expect(pinoHttpOptions(configWith({})).formatters?.level?.('warn', 40)).toEqual({
      level: 'warn',
    });
  });

  it('derives the level of a completed request from its status', () => {
    const { customLogLevel } = pinoHttpOptions(configWith({}));

    expect(customLogLevel?.({} as IncomingMessage, { statusCode: 409 } as ServerResponse)).toBe(
      'warn',
    );
  });
});
