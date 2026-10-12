import { trace } from '@opentelemetry/api';
import { randomUUID } from 'node:crypto';
import { IncomingMessage, ServerResponse } from 'node:http';

export const REQUEST_ID_HEADER = 'x-request-id';

/** Client-supplied ids are untrusted: accept only short, plain tokens so they can't forge log lines. */
const VALID_REQUEST_ID = /^[\w.:-]{1,128}$/;

/**
 * Request id for logs and the `x-request-id` response header: the caller's id when it looks safe
 * (so a gateway's id flows through), otherwise a new UUID. Also tagged on the active HTTP span, so a
 * request id from a client report leads straight to its trace.
 */
export function requestIdFor(req: IncomingMessage, res: ServerResponse): string {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const id =
    typeof incoming === 'string' && VALID_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader(REQUEST_ID_HEADER, id);
  trace.getActiveSpan()?.setAttribute('request.id', id);
  return id;
}
