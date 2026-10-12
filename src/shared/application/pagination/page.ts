import { Cursor, CursorPosition } from './cursor';

export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

/** What a list query asks for. `cursor` is the opaque token from the previous page, if any. */
export interface PageRequest {
  readonly limit: number;
  readonly cursor?: string;
}

/** One page of results. `nextCursor: null` means there are no more. */
export interface Page<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}

/**
 * Builds a page from rows fetched with `take: limit + 1`: the extra row only signals that another
 * page exists and is dropped. The cursor points at the last returned item.
 */
export function buildPage<T>(
  rows: readonly T[],
  limit: number,
  positionOf: (item: T) => CursorPosition,
): Page<T> {
  if (rows.length <= limit) {
    return { items: rows, nextCursor: null };
  }
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return { items, nextCursor: last === undefined ? null : Cursor.encode(positionOf(last)) };
}
