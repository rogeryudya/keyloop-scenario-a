import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { REQUEST_ID_HEADER, requestIdFor } from './request-id';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function exchange(headerValue?: string | string[]): {
  req: IncomingMessage;
  res: ServerResponse;
} {
  const req = new IncomingMessage(new Socket());
  if (headerValue !== undefined) req.headers[REQUEST_ID_HEADER] = headerValue;
  return { req, res: new ServerResponse(req) };
}

describe('requestIdFor', () => {
  it('keeps a well-formed incoming id and echoes it in the response header', () => {
    const { req, res } = exchange('gw-123.abc:9_X');

    expect(requestIdFor(req, res)).toBe('gw-123.abc:9_X');
    expect(res.getHeader(REQUEST_ID_HEADER)).toBe('gw-123.abc:9_X');
  });

  it('generates a UUID when the header is missing', () => {
    const { req, res } = exchange();

    const id = requestIdFor(req, res);
    expect(id).toMatch(UUID);
    expect(res.getHeader(REQUEST_ID_HEADER)).toBe(id);
  });

  it.each([
    ['empty', ''],
    ['too long', 'a'.repeat(129)],
    ['log injection', 'abc\n{"level":60}'],
    ['spaces', 'a b'],
    ['repeated header', ['a', 'b']],
  ])('replaces an unsafe id (%s) with a UUID', (_case, value) => {
    const { req, res } = exchange(value);

    expect(requestIdFor(req, res)).toMatch(UUID);
  });

  it('accepts the maximum length', () => {
    const { req, res } = exchange('a'.repeat(128));

    expect(requestIdFor(req, res)).toBe('a'.repeat(128));
  });
});
