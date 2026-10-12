import { Cursor } from './cursor';
import { InvalidCursorError } from './invalid-cursor.error';

const position = {
  createdAt: new Date('2026-01-02T03:04:05.678Z'),
  id: '70000000-0000-4000-8000-000000000001',
};
const encodeRaw = (value: unknown): string =>
  Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');

describe('Cursor', () => {
  it('round-trips a position', () => {
    expect(Cursor.decode(Cursor.encode(position))).toEqual(position);
  });

  it('produces a URL-safe token', () => {
    expect(Cursor.encode(position)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it.each([
    ['empty string', ''],
    ['non-base64url characters', 'abc+/='],
    ['base64url that is not JSON', Buffer.from('not json').toString('base64url')],
    ['JSON that is not an object', encodeRaw(42)],
    ['JSON null', encodeRaw(null)],
    ['missing id', encodeRaw({ c: '2026-01-02T03:04:05.678Z' })],
    ['missing createdAt', encodeRaw({ i: position.id })],
    ['non-uuid id', encodeRaw({ c: '2026-01-02T03:04:05.678Z', i: 'abc' })],
    ['invalid date', encodeRaw({ c: 'yesterday', i: position.id })],
    ['non-canonical date', encodeRaw({ c: '2026-01-02', i: position.id })],
    ['wrong field types', encodeRaw({ c: 1, i: 2 })],
  ])('rejects %s', (_label, cursor) => {
    expect(() => Cursor.decode(cursor)).toThrow(InvalidCursorError);
  });

  it('reports INVALID_CURSOR on the cursor field', () => {
    const error = new InvalidCursorError();

    expect(error.code).toBe('INVALID_CURSOR');
    expect(error.details).toEqual([expect.objectContaining({ field: 'cursor' })]);
  });
});
