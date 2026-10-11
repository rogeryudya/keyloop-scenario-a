import { Cursor } from './cursor';
import { buildPage } from './page';

interface Row {
  id: string;
  createdAt: Date;
}

const rows: Row[] = [1, 2, 3, 4].map((n) => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  createdAt: new Date(Date.UTC(2026, 0, 10 - n)),
}));
const positionOf = (row: Row): Row => row;

describe('buildPage', () => {
  it('returns all rows and no cursor when fewer than limit were fetched', () => {
    const page = buildPage(rows.slice(0, 2), 3, positionOf);

    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBeNull();
  });

  it('returns no cursor when exactly limit rows were fetched', () => {
    const page = buildPage(rows.slice(0, 3), 3, positionOf);

    expect(page.items).toHaveLength(3);
    expect(page.nextCursor).toBeNull();
  });

  it('drops the extra row and points the cursor at the last returned item', () => {
    const page = buildPage(rows, 3, positionOf);

    expect(page.items).toEqual(rows.slice(0, 3));
    expect(page.nextCursor).not.toBeNull();
    expect(Cursor.decode(page.nextCursor ?? '')).toEqual({
      id: rows[2]?.id,
      createdAt: rows[2]?.createdAt,
    });
  });

  it('returns an empty page for no rows', () => {
    expect(buildPage([], 20, positionOf)).toEqual({ items: [], nextCursor: null });
  });
});
