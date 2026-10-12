import { ApiProperty } from '@nestjs/swagger';
import { toZonedIso } from '../../../../shared/presentation/time/zoned-iso';
import { AvailabilityView } from '../../application/views/availability.view';

export class AvailableSlotDto {
  @ApiProperty({
    format: 'date-time',
    example: '2030-01-15T08:00:00+07:00',
    description: "Local time with the dealership's UTC offset",
  })
  readonly start: string;

  @ApiProperty({
    format: 'date-time',
    example: '2030-01-15T08:30:00+07:00',
    description: 'start + service duration (BR-1)',
  })
  readonly end: string;

  constructor(start: string, end: string) {
    this.start = start;
    this.end = end;
  }
}

export class AvailabilityResponseDto {
  @ApiProperty({
    type: [AvailableSlotDto],
    description: 'Bookable slots in start order, 15 minutes apart from opening time (A-9, A-14)',
  })
  readonly data: AvailableSlotDto[];

  private constructor(view: AvailabilityView) {
    this.data = view.slots.map(
      (s) =>
        new AvailableSlotDto(toZonedIso(s.start, view.timeZone), toZonedIso(s.end, view.timeZone)),
    );
  }

  static from(view: AvailabilityView): AvailabilityResponseDto {
    return new AvailabilityResponseDto(view);
  }
}
