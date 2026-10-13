import { Prisma } from '../../../generated/prisma/client';
import { isLostBookingRace } from './prisma-appointment.repository';

const prismaError = (code: string, meta?: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError('failed', { code, clientVersion: 'test', meta });

/** How the pg driver adapter reports a raw SQLSTATE such as 23P01. */
const adapterError = (sqlState: string) =>
  prismaError('P2010', { driverAdapterError: { cause: { originalCode: sqlState } } });

describe('isLostBookingRace', () => {
  it.each([
    ['exclusion violation 23P01 (overlapping booking, BR-10)', adapterError('23P01')],
    ['unique violation P2002 (same Idempotency-Key, FR-11)', prismaError('P2002')],
    ['write conflict or deadlock P2034', prismaError('P2034')],
  ])('retries after %s', (_case, error) => {
    expect(isLostBookingRace(error)).toBe(true);
  });

  it.each([
    ['another SQLSTATE', adapterError('23503')],
    ['another Prisma code', prismaError('P2025')],
    ['an adapter error without a cause', prismaError('P2010', { driverAdapterError: 'x' })],
    ['a plain Error', new Error('connection reset')],
    ['a non-error', 'P2034'],
  ])('does not retry %s', (_case, error) => {
    expect(isLostBookingRace(error)).toBe(false);
  });
});
