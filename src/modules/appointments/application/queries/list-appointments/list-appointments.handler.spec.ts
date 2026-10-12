import { InMemoryAppointmentReadModel } from '../../../../../../test/fakes/in-memory-appointment-read-model';
import { Cursor, InvalidCursorError } from '../../../../../shared/application/pagination';
import { AppointmentStatus } from '../../../domain/appointment-status';
import { AppointmentView } from '../../views/appointment.view';
import { ListAppointmentsHandler } from './list-appointments.handler';
import { ListAppointmentsQuery } from './list-appointments.query';

const BANGKOK = 'd0000000-0000-4000-8000-000000000001';
const HANOI = 'd0000000-0000-4000-8000-000000000002';
const SOMSAK = 'c0000000-0000-4000-8000-000000000001';
const MALEE = 'c0000000-0000-4000-8000-000000000002';

const view = (
  n: number,
  options: { dealership?: string; customer?: string; start?: string } = {},
): AppointmentView => {
  const start = new Date(options.start ?? '2026-10-13T03:00:00.000Z');
  return {
    id: `a0000000-0000-4000-8000-00000000000${n}`,
    status: AppointmentStatus.Confirmed,
    start,
    end: new Date(start.getTime() + 30 * 60_000),
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    cancelledAt: null,
    dealership: { id: options.dealership ?? BANGKOK, name: 'D', timeZone: 'Asia/Bangkok' },
    serviceBay: { id: 'b1', name: 'Bay 1' },
    technician: { id: 't1', name: 'T' },
    serviceType: { id: 's1', code: 'OIL_CHANGE', name: 'Oil', durationMinutes: 30 },
    customer: { id: options.customer ?? SOMSAK, name: 'C' },
    vehicle: { id: 'v1', registration: 'R', make: 'M', model: 'X' },
  };
};

const idsOf = (views: readonly AppointmentView[]): number[] =>
  views.map((v) => Number(v.id.slice(-1)));

describe('ListAppointmentsHandler', () => {
  const setup = (views: AppointmentView[]) => {
    const readModel = new InMemoryAppointmentReadModel(views);
    return { readModel, handler: new ListAppointmentsHandler(readModel) };
  };

  it("lists a dealership's appointments newest first (FR-9)", async () => {
    const { handler } = setup([view(1), view(2, { dealership: HANOI }), view(3)]);

    const page = await handler.execute(
      new ListAppointmentsQuery({ dealershipId: BANGKOK }, { limit: 20 }),
    );

    expect(idsOf(page.items)).toEqual([3, 1]); // same createdAt: id DESC
    expect(page.nextCursor).toBeNull();
  });

  it("lists a customer's appointments across dealerships", async () => {
    const { handler } = setup([
      view(1, { customer: SOMSAK }),
      view(2, { customer: MALEE }),
      view(3, { customer: SOMSAK, dealership: HANOI }),
    ]);

    const page = await handler.execute(
      new ListAppointmentsQuery({ customerId: SOMSAK }, { limit: 20 }),
    );

    expect(idsOf(page.items)).toEqual([3, 1]);
  });

  it('passes the filter and one extra row to the read model', async () => {
    const { readModel, handler } = setup([]);
    const filter = { dealershipId: BANGKOK, startFrom: new Date('2026-10-13T00:00:00Z') };

    await handler.execute(new ListAppointmentsQuery(filter, { limit: 2 }));

    expect(readModel.requests.at(-1)).toEqual({ filter, slice: { after: undefined, take: 3 } });
  });

  it('walks every page via nextCursor without gaps or repeats', async () => {
    const { handler } = setup([1, 2, 3, 4, 5].map((n) => view(n)));
    const seen: number[] = [];
    let cursor: string | undefined;
    do {
      const page = await handler.execute(
        new ListAppointmentsQuery(
          { dealershipId: BANGKOK },
          cursor === undefined ? { limit: 2 } : { limit: 2, cursor },
        ),
      );
      seen.push(...idsOf(page.items));
      cursor = page.nextCursor ?? undefined;
    } while (cursor !== undefined);

    expect(seen).toEqual([5, 4, 3, 2, 1]);
  });

  it('passes the decoded cursor position to the read model', async () => {
    const { readModel, handler } = setup([]);
    const position = { createdAt: new Date('2026-10-01T00:00:00.000Z'), id: view(3).id };

    await handler.execute(
      new ListAppointmentsQuery(
        { customerId: SOMSAK },
        { limit: 2, cursor: Cursor.encode(position) },
      ),
    );

    expect(readModel.requests.at(-1)?.slice).toEqual({ after: position, take: 3 });
  });

  it('returns an empty page when nothing matches', async () => {
    const { handler } = setup([view(1)]);

    const page = await handler.execute(
      new ListAppointmentsQuery({ customerId: MALEE }, { limit: 20 }),
    );

    expect(page).toEqual({ items: [], nextCursor: null });
  });

  it('rejects a cursor this API did not produce', async () => {
    const { handler } = setup([view(1)]);

    await expect(
      handler.execute(
        new ListAppointmentsQuery({ dealershipId: BANGKOK }, { limit: 2, cursor: 'x!' }),
      ),
    ).rejects.toThrow(InvalidCursorError);
  });
});
