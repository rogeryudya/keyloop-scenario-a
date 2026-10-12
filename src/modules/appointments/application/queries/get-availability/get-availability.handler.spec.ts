import { randomUUID } from 'node:crypto';
import { FixedClock } from '../../../../../../test/fakes/fixed-clock';
import { InMemoryAppointmentRepository } from '../../../../../../test/fakes/in-memory-appointment-repository';
import { InMemoryBookableResources } from '../../../../../../test/fakes/in-memory-bookable-resources';
import { InvalidLocalDateError, OpeningHours } from '../../../../../shared/domain/opening-hours';
import { TimeSlot } from '../../../../../shared/domain/time-slot';
import { AppointmentStatus } from '../../../domain/appointment-status';
import { Appointment } from '../../../domain/appointment.entity';
import { GetAvailabilityHandler } from './get-availability.handler';
import { GetAvailabilityQuery } from './get-availability.query';

// Bangkok (UTC+7), open 08:00–18:00 local = 01:00Z–11:00Z.
const BANGKOK = 'd0000000-0000-4000-8000-000000000001';
const OIL_CHANGE = 's0000000-0000-4000-8000-000000000001'; // 60 min
const TRANSMISSION = 's0000000-0000-4000-8000-000000000002'; // nobody qualified
const BAY_1 = 'b0000000-0000-4000-8000-000000000001';
const ANONG = 't0000000-0000-4000-8000-000000000001';
const UNKNOWN = 'f0000000-0000-4000-8000-000000000000';

const DATE = '2026-10-13';
const NOW = '2026-10-12T03:00:00.000Z';

const bangkokHours = OpeningHours.of({
  opensAt: '08:00',
  closesAt: '18:00',
  timeZone: 'Asia/Bangkok',
});

const existing = (from: string, to: string, status = AppointmentStatus.Confirmed) =>
  Appointment.restore({
    id: randomUUID(),
    dealershipId: BANGKOK,
    serviceBayId: BAY_1,
    technicianId: ANONG,
    serviceTypeId: OIL_CHANGE,
    customerId: 'c0000000-0000-4000-8000-000000000001',
    vehicleId: 'v0000000-0000-4000-8000-000000000001',
    slot: TimeSlot.of(new Date(from), new Date(to)),
    status,
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    cancelledAt:
      status === AppointmentStatus.Cancelled ? new Date('2026-10-02T00:00:00.000Z') : null,
  });

const handlerWith = (appointments: Appointment[] = []): GetAvailabilityHandler =>
  new GetAvailabilityHandler(
    new InMemoryAppointmentRepository(appointments),
    new InMemoryBookableResources({
      dealerships: [{ id: BANGKOK, openingHours: bangkokHours }],
      serviceTypes: [
        { id: OIL_CHANGE, durationMinutes: 60 },
        { id: TRANSMISSION, durationMinutes: 240 },
      ],
      bays: [{ id: BAY_1, dealershipId: BANGKOK }],
      technicians: [{ id: ANONG, dealershipId: BANGKOK, serviceTypeIds: [OIL_CHANGE] }],
    }),
    new FixedClock(NOW),
  );

const query = (overrides: Partial<GetAvailabilityQuery> = {}): GetAvailabilityQuery => {
  const q = { dealershipId: BANGKOK, serviceTypeId: OIL_CHANGE, date: DATE, ...overrides };
  return new GetAvailabilityQuery(q.dealershipId, q.serviceTypeId, q.date);
};

describe('GetAvailabilityHandler', () => {
  it("returns the day's slots with the dealership's time zone (FR-7)", async () => {
    const view = await handlerWith().execute(query());

    expect(view.timeZone).toBe('Asia/Bangkok');
    expect(view.slots).toHaveLength(37); // 08:00 … 17:00 every 15 min
    expect(view.slots[0]).toEqual({
      start: new Date('2026-10-13T01:00:00.000Z'),
      end: new Date('2026-10-13T02:00:00.000Z'),
    });
    expect(view.slots.at(-1)).toEqual({
      start: new Date('2026-10-13T10:00:00.000Z'),
      end: new Date('2026-10-13T11:00:00.000Z'),
    });
  });

  it('leaves out slots taken by stored confirmed appointments', async () => {
    // 10:00–12:00 local is taken.
    const handler = handlerWith([existing('2026-10-13T03:00:00Z', '2026-10-13T05:00:00Z')]);

    const starts = (await handler.execute(query())).slots.map((s) => s.start.toISOString());

    expect(starts).toContain('2026-10-13T02:00:00.000Z'); // 09:00–10:00, back to back
    expect(starts).not.toContain('2026-10-13T02:15:00.000Z');
    expect(starts).not.toContain('2026-10-13T04:45:00.000Z');
    expect(starts).toContain('2026-10-13T05:00:00.000Z'); // 12:00
  });

  it('offers a cancelled appointment slot again (BR-9)', async () => {
    const handler = handlerWith([
      existing('2026-10-13T03:00:00Z', '2026-10-13T05:00:00Z', AppointmentStatus.Cancelled),
    ]);

    await expect(handler.execute(query())).resolves.toMatchObject({
      slots: expect.arrayContaining([
        {
          start: new Date('2026-10-13T03:00:00.000Z'),
          end: new Date('2026-10-13T04:00:00.000Z'),
        },
      ]) as unknown,
    });
  });

  it('throws DEALERSHIP_NOT_FOUND for an unknown dealership', async () => {
    await expect(handlerWith().execute(query({ dealershipId: UNKNOWN }))).rejects.toMatchObject({
      code: 'DEALERSHIP_NOT_FOUND',
      details: [{ field: 'dealershipId' }],
    });
  });

  it('throws SERVICE_TYPE_NOT_FOUND for an unknown service type', async () => {
    await expect(handlerWith().execute(query({ serviceTypeId: UNKNOWN }))).rejects.toMatchObject({
      code: 'SERVICE_TYPE_NOT_FOUND',
      details: [{ field: 'serviceTypeId' }],
    });
  });

  it('throws SERVICE_TYPE_NOT_SUPPORTED with an availability message (BR-6)', async () => {
    await expect(
      handlerWith().execute(query({ serviceTypeId: TRANSMISSION })),
    ).rejects.toMatchObject({
      code: 'SERVICE_TYPE_NOT_SUPPORTED',
      message: 'This dealership does not offer the service type, so it has no availability for it',
    });
  });

  it('throws INVALID_DATE for an impossible date', async () => {
    await expect(handlerWith().execute(query({ date: '2026-02-30' }))).rejects.toThrow(
      InvalidLocalDateError,
    );
  });
});
