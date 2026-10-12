import { AppointmentStatus } from '../../domain/appointment-status';

type Named = Readonly<{ id: string; name: string }>;

/** FR-6: an appointment with the ids and display names of everything it links (FR-3). */
export type AppointmentView = Readonly<{
  id: string;
  status: AppointmentStatus;
  start: Date;
  end: Date;
  createdAt: Date;
  cancelledAt: Date | null;
  dealership: Named & Readonly<{ timeZone: string }>;
  serviceBay: Named;
  technician: Named;
  serviceType: Named & Readonly<{ code: string; durationMinutes: number }>;
  /** `name` is "first last". */
  customer: Named;
  vehicle: Readonly<{ id: string; registration: string; make: string; model: string }>;
}>;
