import { TimeSlot } from '../../../shared/domain/time-slot';
import { AppointmentStatus } from './appointment-status';
import { AppointmentInPastError, AppointmentNotCancellableError } from './appointment.errors';

export interface AppointmentProps {
  readonly id: string;
  readonly dealershipId: string;
  readonly serviceBayId: string;
  readonly technicianId: string;
  readonly serviceTypeId: string;
  readonly customerId: string;
  readonly vehicleId: string;
  readonly slot: TimeSlot;
  readonly status: AppointmentStatus;
  readonly createdAt: Date;
  /** Set if and only if `status` is `Cancelled`. */
  readonly cancelledAt: Date | null;
}

export interface CreateAppointmentInput {
  readonly id: string;
  readonly dealershipId: string;
  readonly serviceBayId: string;
  readonly technicianId: string;
  readonly serviceTypeId: string;
  readonly customerId: string;
  readonly vehicleId: string;
  readonly start: Date;
  /** The service type's `durationMinutes`. */
  readonly durationMinutes: number;
  readonly now: Date;
}

export class Appointment {
  private constructor(private props: AppointmentProps) {}

  static create(input: CreateAppointmentInput): Appointment {
    const { start, durationMinutes, now, ...ids } = input;
    const slot = TimeSlot.fromStartAndDuration(start, durationMinutes); // BR-1
    if (slot.start.getTime() <= now.getTime()) throw new AppointmentInPastError(); // BR-3
    return new Appointment({
      ...ids,
      slot,
      status: AppointmentStatus.Confirmed,
      createdAt: new Date(now.getTime()),
      cancelledAt: null,
    });
  }

  /** Rebuilds from storage; creation rules are skipped because stored data was valid when written. */
  static restore(props: AppointmentProps): Appointment {
    return new Appointment({ ...props });
  }

  cancel(now: Date): void {
    if (this.props.status !== AppointmentStatus.Confirmed) {
      throw new AppointmentNotCancellableError(); // BR-12
    }
    this.props = {
      ...this.props,
      status: AppointmentStatus.Cancelled,
      cancelledAt: new Date(now.getTime()),
    };
  }

  get id(): string {
    return this.props.id;
  }

  get status(): AppointmentStatus {
    return this.props.status;
  }

  get slot(): TimeSlot {
    return this.props.slot;
  }

  toSnapshot(): AppointmentProps {
    return { ...this.props };
  }
}
