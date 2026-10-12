import { Transactional } from '@nestjs-cls/transactional';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { createHash, randomUUID } from 'node:crypto';
import { Clock } from '../../../../../shared/domain/clock';
import { TimeSlot } from '../../../../../shared/domain/time-slot';
import { Appointment } from '../../../domain/appointment.entity';
import {
  AppointmentConflictError,
  BookingReferenceNotFoundError,
  IdempotencyKeyReusedError,
  VehicleNotOwnedByCustomerError,
} from '../../../domain/appointment.errors';
import { AppointmentRepository } from '../../../domain/appointment.repository';
import { ResourceAllocator } from '../../../domain/resource-allocator';
import { BookableResources } from '../../ports/bookable-resources';
import { BookingParties } from '../../ports/booking-parties';
import { IdempotencyKeys } from '../../ports/idempotency-keys';
import { CreateAppointmentCommand } from './create-appointment.command';

/** Retries after a lost race; a fresh attempt may find another free bay or technician. */
export const MAX_CONFLICT_RETRIES = 3;

/**
 * FR-11 request identity: the same booking whatever the JSON formatting or offset used for `start`
 * (A-16). The key itself is not part of it.
 */
const requestHashOf = (cmd: CreateAppointmentCommand): string =>
  createHash('sha256')
    .update(
      JSON.stringify([
        cmd.customerId,
        cmd.vehicleId,
        cmd.dealershipId,
        cmd.serviceTypeId,
        cmd.start.toISOString(),
      ]),
    )
    .digest('hex');

@CommandHandler(CreateAppointmentCommand)
export class CreateAppointmentHandler implements ICommandHandler<CreateAppointmentCommand> {
  constructor(
    private readonly appointments: AppointmentRepository,
    private readonly resources: BookableResources,
    private readonly parties: BookingParties,
    private readonly idempotencyKeys: IdempotencyKeys,
    private readonly clock: Clock,
  ) {}

  /**
   * Each attempt is its own transaction: after an exclusion violation Postgres aborts the
   * transaction, so the retry must start a new one and re-read what the winner committed.
   */
  async execute(cmd: CreateAppointmentCommand): Promise<{ id: string }> {
    for (let retry = 0; ; retry += 1) {
      try {
        return await this.book(cmd);
      } catch (error) {
        if (!(error instanceof AppointmentConflictError) || retry >= MAX_CONFLICT_RETRIES) {
          throw error;
        }
      }
    }
  }

  /**
   * One transaction: check and reserve are atomic (A-8); the DB constraint backs BR-10. With an
   * idempotency key, a known key is answered before any other check, so a replay gets the original
   * result even if, say, its start time has passed since (ADR-0007).
   */
  @Transactional()
  private async book(cmd: CreateAppointmentCommand): Promise<{ id: string }> {
    const requestHash = cmd.idempotencyKey === undefined ? undefined : requestHashOf(cmd);
    if (cmd.idempotencyKey !== undefined) {
      const prior = await this.idempotencyKeys.find(cmd.idempotencyKey);
      if (prior) {
        if (prior.requestHash !== requestHash) throw new IdempotencyKeyReusedError();
        return { id: prior.appointmentId };
      }
    }

    const dealership = await this.resources.findDealership(cmd.dealershipId);
    if (!dealership) throw BookingReferenceNotFoundError.dealership(cmd.dealershipId); // BR-13
    const serviceType = await this.resources.findServiceType(cmd.serviceTypeId);
    if (!serviceType) throw BookingReferenceNotFoundError.serviceType(cmd.serviceTypeId);
    if (!(await this.parties.customerExists(cmd.customerId))) {
      throw BookingReferenceNotFoundError.customer(cmd.customerId);
    }
    const ownerId = await this.parties.findVehicleOwnerId(cmd.vehicleId);
    if (ownerId === null) throw BookingReferenceNotFoundError.vehicle(cmd.vehicleId);
    if (ownerId !== cmd.customerId) throw new VehicleNotOwnedByCustomerError(); // BR-5

    const now = this.clock.now();
    const slot = TimeSlot.fromStartAndDuration(cmd.start, serviceType.durationMinutes); // BR-1
    Appointment.assertBookableSlot(slot, dealership.openingHours, now); // BR-3, BR-4

    const { bays, technicians } = await this.resources.findCandidates(
      dealership.id,
      serviceType.id,
    );
    const overlapping = await this.appointments.findConfirmedOverlapping(dealership.id, slot);
    const technicianDayLoad = await this.appointments.countForTechniciansOnDay(
      technicians.map((t) => t.id),
      slot.start,
      dealership.openingHours.timeZone,
    );
    const { serviceBayId, technicianId } = ResourceAllocator.allocate({
      dealershipId: dealership.id,
      serviceTypeId: serviceType.id,
      slot,
      bays,
      technicians,
      bookings: overlapping.map((a) => a.toSnapshot()),
      technicianDayLoad,
    }); // BR-6, BR-7, BR-8, BR-11

    const appointment = Appointment.create({
      id: randomUUID(),
      dealershipId: dealership.id,
      serviceBayId,
      technicianId,
      serviceTypeId: serviceType.id,
      customerId: cmd.customerId,
      vehicleId: cmd.vehicleId,
      start: cmd.start,
      durationMinutes: serviceType.durationMinutes,
      openingHours: dealership.openingHours,
      now,
    });
    await this.appointments.save(appointment);
    if (cmd.idempotencyKey !== undefined && requestHash !== undefined) {
      await this.idempotencyKeys.save({
        key: cmd.idempotencyKey,
        requestHash,
        appointmentId: appointment.id,
        createdAt: now,
      });
    }
    return { id: appointment.id };
  }
}
