import { containerSlot } from './global-setup';

export default async function globalTeardown(): Promise<void> {
  const container = containerSlot.__keyloopPostgres;
  containerSlot.__keyloopPostgres = undefined;
  await container?.stop();
}
