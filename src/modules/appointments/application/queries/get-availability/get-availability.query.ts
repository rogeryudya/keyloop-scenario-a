import { Query } from '@nestjs/cqrs';
import { AvailabilityView } from '../../views/availability.view';

export class GetAvailabilityQuery extends Query<AvailabilityView> {
  constructor(
    public readonly dealershipId: string,
    public readonly serviceTypeId: string,
    /** Local calendar date `YYYY-MM-DD` in the dealership's time zone (A-14). */
    public readonly date: string,
  ) {
    super();
  }
}
