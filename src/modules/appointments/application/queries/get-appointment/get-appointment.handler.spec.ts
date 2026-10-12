import { InMemoryAppointmentReadModel } from '../../../../../../test/fakes/in-memory-appointment-read-model';
import { AppointmentStatus } from '../../../domain/appointment-status';
import { AppointmentNotFoundError } from '../../../domain/appointment.errors';
import { AppointmentView } from '../../views/appointment.view';
import { GetAppointmentHandler } from './get-appointment.handler';
import { GetAppointmentQuery } from './get-appointment.query';

const VIEW: AppointmentView = {
  id: 'a0000000-0000-4000-8000-000000000001',
  status: AppointmentStatus.Confirmed,
  start: new Date('2026-10-13T03:00:00.000Z'),
  end: new Date('2026-10-13T03:30:00.000Z'),
  createdAt: new Date('2026-10-12T03:00:00.000Z'),
  cancelledAt: null,
  dealership: { id: 'd1', name: 'Keyloop Motors Bangkok', timeZone: 'Asia/Bangkok' },
  serviceBay: { id: 'b1', name: 'Bay 1' },
  technician: { id: 't1', name: 'Anong Srisuk' },
  serviceType: { id: 's1', code: 'OIL_CHANGE', name: 'Oil and filter change', durationMinutes: 30 },
  customer: { id: 'c1', name: 'Somsak Jaidee' },
  vehicle: { id: 'v1', registration: '1AB 2345', make: 'Toyota', model: 'Corolla Altis' },
};

describe('GetAppointmentHandler', () => {
  const handler = new GetAppointmentHandler(new InMemoryAppointmentReadModel([VIEW]));

  it('returns the appointment view (FR-6)', async () => {
    await expect(handler.execute(new GetAppointmentQuery(VIEW.id))).resolves.toEqual(VIEW);
  });

  it('throws APPOINTMENT_NOT_FOUND for an unknown id', async () => {
    const result = handler.execute(new GetAppointmentQuery('a0000000-0000-4000-8000-000000000099'));

    await expect(result).rejects.toThrow(AppointmentNotFoundError);
    await expect(result).rejects.toMatchObject({
      code: 'APPOINTMENT_NOT_FOUND',
      details: [{ field: 'id' }],
    });
  });
});
