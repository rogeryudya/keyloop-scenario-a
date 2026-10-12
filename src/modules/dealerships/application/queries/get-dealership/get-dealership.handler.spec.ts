import { InMemoryDealershipReadModel } from '../../../../../../test/fakes/in-memory-dealership-read-model';
import { DealershipNotFoundError } from '../../../domain/dealership.errors';
import { DealershipDetailView } from '../../views/dealership.view';
import { GetDealershipHandler } from './get-dealership.handler';
import { GetDealershipQuery } from './get-dealership.query';

const BANGKOK: DealershipDetailView = {
  id: '10000000-0000-4000-8000-000000000001',
  name: 'Keyloop Motors Bangkok',
  timeZone: 'Asia/Bangkok',
  opensAt: '08:00',
  closesAt: '18:00',
  createdAt: new Date('2026-10-01T00:00:00.000Z'),
  supportedServiceTypeIds: ['40000000-0000-4000-8000-000000000001'],
};

describe('GetDealershipHandler', () => {
  const handler = new GetDealershipHandler(new InMemoryDealershipReadModel([BANGKOK]));

  it('returns the dealership with its supported service types', async () => {
    expect(await handler.execute(new GetDealershipQuery(BANGKOK.id))).toEqual(BANGKOK);
  });

  it('throws DEALERSHIP_NOT_FOUND for an unknown id (BR-13)', async () => {
    const id = '10000000-0000-4000-8000-000000000099';

    await expect(handler.execute(new GetDealershipQuery(id))).rejects.toThrow(
      DealershipNotFoundError,
    );
    await expect(handler.execute(new GetDealershipQuery(id))).rejects.toMatchObject({
      code: 'DEALERSHIP_NOT_FOUND',
    });
  });
});
