import { AppointmentView } from '../views/appointment.view';

/** Read port for appointment queries. Returns views directly, skipping the entity. Also the DI token. */
export abstract class AppointmentReadModel {
  abstract findById(id: string): Promise<AppointmentView | null>;
}
