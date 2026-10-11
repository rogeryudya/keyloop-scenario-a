import { Transactional } from '@nestjs-cls/transactional';
import { useNoOpTransactions } from './transactions';

class SampleHandler {
  calls = 0;

  @Transactional()
  execute(fail: boolean): Promise<string> {
    this.calls += 1;
    return fail ? Promise.reject(new Error('boom')) : Promise.resolve('done');
  }
}

describe('useNoOpTransactions', () => {
  let close: () => Promise<void>;

  beforeAll(async () => {
    close = await useNoOpTransactions();
  });

  afterAll(async () => {
    await close();
  });

  it('lets a @Transactional() method run without a database', async () => {
    const handler = new SampleHandler();

    await expect(handler.execute(false)).resolves.toBe('done');
    expect(handler.calls).toBe(1);
  });

  it('propagates errors from the method', async () => {
    await expect(new SampleHandler().execute(true)).rejects.toThrow('boom');
  });
});
