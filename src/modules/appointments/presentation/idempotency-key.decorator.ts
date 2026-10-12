import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import { RequestValidationError } from '../../../shared/presentation/validation/request-validation.error';

export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';

/** Visible ASCII, no spaces; long enough for a UUID or a client-chosen token (A-16). */
const VALID_KEY = /^[\x21-\x7E]{1,255}$/;

/** Validates the optional `Idempotency-Key` header value (FR-11); absent stays `undefined`. */
export function parseIdempotencyKey(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !VALID_KEY.test(value)) {
    throw new RequestValidationError([
      {
        field: IDEMPOTENCY_KEY_HEADER,
        issue: 'must be 1-255 visible ASCII characters without spaces',
      },
    ]);
  }
  return value;
}

/** The validated `Idempotency-Key` header, or `undefined` when absent (400 when malformed). */
export const IdempotencyKey = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined =>
    parseIdempotencyKey(
      ctx.switchToHttp().getRequest<IncomingMessage>().headers[
        IDEMPOTENCY_KEY_HEADER.toLowerCase()
      ],
    ),
);
