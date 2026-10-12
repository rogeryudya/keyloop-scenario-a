import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Clock } from '../../../../../shared/domain/clock';
import { BookingReferenceNotFoundError } from '../../../domain/appointment.errors';
import { AppointmentRepository } from '../../../domain/appointment.repository';
import { Availability } from '../../../domain/availability';
import { BookableResources } from '../../ports/bookable-resources';
import { AvailabilityView } from '../../views/availability.view';
import { GetAvailabilityQuery } from './get-availability.query';

@QueryHandler(GetAvailabilityQuery)
export class GetAvailabilityHandler implements IQueryHandler<GetAvailabilityQuery> {
  constructor(
    private readonly appointments: AppointmentRepository,
    private readonly resources: BookableResources,
    private readonly clock: Clock,
  ) {}

  /** Loads the day's bookings once and computes every slot in memory (no query per slot). */
  async execute(query: GetAvailabilityQuery): Promise<AvailabilityView> {
    const dealership = await this.resources.findDealership(query.dealershipId);
    if (!dealership) throw BookingReferenceNotFoundError.dealership(query.dealershipId); // BR-13
    const serviceType = await this.resources.findServiceType(query.serviceTypeId);
    if (!serviceType) throw BookingReferenceNotFoundError.serviceType(query.serviceTypeId);

    const window = dealership.openingHours.windowOn(query.date);
    const { bays, technicians } = await this.resources.findCandidates(
      dealership.id,
      serviceType.id,
    );
    const bookings = await this.appointments.findConfirmedOverlapping(dealership.id, window);

    const slots = Availability.slotsOn({
      dealershipId: dealership.id,
      serviceTypeId: serviceType.id,
      durationMinutes: serviceType.durationMinutes,
      date: query.date,
      openingHours: dealership.openingHours,
      now: this.clock.now(),
      bays,
      technicians,
      bookings: bookings.map((a) => a.toSnapshot()),
    }); // FR-7: BR-3, BR-4, BR-6/7/8/9

    return {
      timeZone: dealership.openingHours.timeZone,
      slots: slots.map((s) => ({ start: s.start, end: s.end })),
    };
  }
}
