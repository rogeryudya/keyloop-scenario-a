import { Transactional } from '@nestjs-cls/transactional';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { randomUUID } from 'node:crypto';
import { Clock } from '../../../../../shared/domain/clock';
import { TimeSlot } from '../../../../../shared/domain/time-slot';
import { Appointment } from '../../../domain/appointment.entity';
import {
  BookingReferenceNotFoundError,
  VehicleNotOwnedByCustomerError,
} from '../../../domain/appointment.errors';
import { AppointmentRepository } from '../../../domain/appointment.repository';
import { ResourceAllocator } from '../../../domain/resource-allocator';
import { BookableResources } from '../../ports/bookable-resources';
import { BookingParties } from '../../ports/booking-parties';
import { CreateAppointmentCommand } from './create-appointment.command';

@CommandHandler(CreateAppointmentCommand)
export class CreateAppointmentHandler implements ICommandHandler<CreateAppointmentCommand> {
  constructor(
    private readonly appointments: AppointmentRepository,
    private readonly resources: BookableResources,
    private readonly parties: BookingParties,
    private readonly clock: Clock,
  ) {}

  /** One transaction: check and reserve are atomic (A-8); the DB constraint backs BR-10. */
  @Transactional()
  async execute(cmd: CreateAppointmentCommand): Promise<{ id: string }> {
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
    return { id: appointment.id };
  }
}
