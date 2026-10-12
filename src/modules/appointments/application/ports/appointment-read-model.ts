import { CursorPosition } from '../../../../shared/application/pagination';
import { AppointmentView } from '../views/appointment.view';

/** FR-9 filter; every given field must match (A-15). */
export interface AppointmentFilter {
  readonly dealershipId?: string;
  readonly customerId?: string;
  /** Inclusive lower bound on the appointment's start. */
  readonly startFrom?: Date;
  /** Exclusive upper bound on the appointment's start. */
  readonly startBefore?: Date;
}

/** Keyset page request: rows strictly after `after` in `createdAt DESC, id DESC` order. */
export interface AppointmentSlice {
  readonly after?: CursorPosition;
  readonly take: number;
}

/** Read port for appointment queries. Returns views directly, skipping the entity. Also the DI token. */
export abstract class AppointmentReadModel {
  abstract findById(id: string): Promise<AppointmentView | null>;

  abstract list(filter: AppointmentFilter, slice: AppointmentSlice): Promise<AppointmentView[]>;
}
