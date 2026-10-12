import { AppointmentReadModel } from '../../src/modules/appointments/application/ports/appointment-read-model';
import { AppointmentView } from '../../src/modules/appointments/application/views/appointment.view';

export class InMemoryAppointmentReadModel extends AppointmentReadModel {
  constructor(private readonly views: readonly AppointmentView[] = []) {
    super();
  }

  findById(id: string): Promise<AppointmentView | null> {
    return Promise.resolve(this.views.find((v) => v.id === id) ?? null);
  }
}
