import { InvalidCursorError } from './invalid-cursor.error';

/** Sort key of the last item on a page: `createdAt DESC, id DESC` (docs/conventions.md › API). */
export interface CursorPosition {
  readonly createdAt: Date;
  readonly id: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

/** Opaque base64url cursor. Clients must not parse it, so its shape can change without a new API version. */
export const Cursor = {
  encode(position: CursorPosition): string {
    const payload = JSON.stringify({ c: position.createdAt.toISOString(), i: position.id });
    return Buffer.from(payload, 'utf8').toString('base64url');
  },

  /** @throws InvalidCursorError for anything not produced by `encode`. */
  decode(cursor: string): CursorPosition {
    if (!BASE64URL.test(cursor)) throw new InvalidCursorError();
    let parsed: unknown;
    try {
      parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    } catch {
      throw new InvalidCursorError();
    }
    if (typeof parsed !== 'object' || parsed === null) throw new InvalidCursorError();
    const { c, i } = parsed as Record<string, unknown>;
    if (typeof c !== 'string' || typeof i !== 'string' || !UUID.test(i)) {
      throw new InvalidCursorError();
    }
    const createdAt = new Date(c);
    if (Number.isNaN(createdAt.getTime()) || createdAt.toISOString() !== c) {
      throw new InvalidCursorError();
    }
    return { createdAt, id: i };
  },
};
