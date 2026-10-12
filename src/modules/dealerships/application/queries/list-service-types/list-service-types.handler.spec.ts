import { InMemoryDealershipReadModel } from '../../../../../../test/fakes/in-memory-dealership-read-model';
import { InvalidCursorError } from '../../../../../shared/application/pagination';
import { ServiceTypeView } from '../../views/service-type.view';
import { ListServiceTypesHandler } from './list-service-types.handler';
import { ListServiceTypesQuery } from './list-service-types.query';

const serviceType = (n: number, createdAt: string): ServiceTypeView => ({
  id: `40000000-0000-4000-8000-00000000000${n}`,
  code: `TYPE_${n}`,
  name: `Type ${n}`,
  durationMinutes: 30 * n,
  createdAt: new Date(createdAt),
});

describe('ListServiceTypesHandler', () => {
  const readModel = new InMemoryDealershipReadModel(
    [],
    [
      serviceType(1, '2026-10-01T00:00:00.000Z'),
      serviceType(2, '2026-10-03T00:00:00.000Z'),
      serviceType(3, '2026-10-02T00:00:00.000Z'),
    ],
  );
  const handler = new ListServiceTypesHandler(readModel);

  it('orders by createdAt DESC and pages with a cursor', async () => {
    const first = await handler.execute(new ListServiceTypesQuery({ limit: 2 }));
    const second = await handler.execute(
      new ListServiceTypesQuery({ limit: 2, cursor: first.nextCursor ?? '' }),
    );

    expect(first.items.map((s) => s.code)).toEqual(['TYPE_2', 'TYPE_3']);
    expect(second.items.map((s) => s.code)).toEqual(['TYPE_1']);
    expect(second.nextCursor).toBeNull();
  });

  it('rejects an invalid cursor', async () => {
    await expect(
      handler.execute(new ListServiceTypesQuery({ limit: 2, cursor: 'x' })),
    ).rejects.toThrow(InvalidCursorError);
  });
});
