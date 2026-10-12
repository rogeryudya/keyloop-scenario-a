import { InMemoryDealershipReadModel } from '../../../../../../test/fakes/in-memory-dealership-read-model';
import { Cursor, InvalidCursorError } from '../../../../../shared/application/pagination';
import { DealershipDetailView } from '../../views/dealership.view';
import { ListDealershipsHandler } from './list-dealerships.handler';
import { ListDealershipsQuery } from './list-dealerships.query';

const dealership = (
  n: number,
  createdAt = new Date('2026-10-01T00:00:00.000Z'),
): DealershipDetailView => ({
  id: `10000000-0000-4000-8000-00000000000${n}`,
  name: `Dealership ${n}`,
  timeZone: 'Asia/Bangkok',
  opensAt: '08:00',
  closesAt: '18:00',
  createdAt,
  supportedServiceTypeIds: [],
});

describe('ListDealershipsHandler', () => {
  // Same createdAt (seeded together): the id DESC tiebreaker decides the order.
  const readModel = new InMemoryDealershipReadModel([1, 2, 3, 4, 5].map((n) => dealership(n)));
  const handler = new ListDealershipsHandler(readModel);

  it('returns the first page newest first, with a cursor when more exist', async () => {
    const page = await handler.execute(new ListDealershipsQuery({ limit: 2 }));

    expect(page.items.map((d) => d.name)).toEqual(['Dealership 5', 'Dealership 4']);
    expect(page.nextCursor).not.toBeNull();
  });

  it('fetches one extra row to detect the next page', async () => {
    await handler.execute(new ListDealershipsQuery({ limit: 2 }));

    expect(readModel.slices.at(-1)).toEqual({ after: undefined, take: 3 });
  });

  it('walks every page via nextCursor without gaps or repeats', async () => {
    const names: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await handler.execute(
        new ListDealershipsQuery(cursor === undefined ? { limit: 2 } : { limit: 2, cursor }),
      );
      names.push(...page.items.map((d) => d.name));
      cursor = page.nextCursor ?? undefined;
    } while (cursor !== undefined);

    expect(names).toEqual([
      'Dealership 5',
      'Dealership 4',
      'Dealership 3',
      'Dealership 2',
      'Dealership 1',
    ]);
  });

  it('passes the decoded cursor position to the read model', async () => {
    const position = { createdAt: new Date('2026-10-01T00:00:00.000Z'), id: dealership(3).id };

    await handler.execute(new ListDealershipsQuery({ limit: 2, cursor: Cursor.encode(position) }));

    expect(readModel.slices.at(-1)).toEqual({ after: position, take: 3 });
  });

  it('returns no cursor on the last page', async () => {
    const page = await handler.execute(new ListDealershipsQuery({ limit: 5 }));

    expect(page.items).toHaveLength(5);
    expect(page.nextCursor).toBeNull();
  });

  it('returns an empty page when there are no dealerships', async () => {
    const empty = new ListDealershipsHandler(new InMemoryDealershipReadModel());

    expect(await empty.execute(new ListDealershipsQuery({ limit: 20 }))).toEqual({
      items: [],
      nextCursor: null,
    });
  });

  it('rejects a cursor this API did not produce', async () => {
    await expect(
      handler.execute(new ListDealershipsQuery({ limit: 2, cursor: 'not-a-cursor' })),
    ).rejects.toThrow(InvalidCursorError);
  });
});
