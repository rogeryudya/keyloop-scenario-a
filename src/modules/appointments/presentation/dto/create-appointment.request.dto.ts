import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsUUID, Matches } from 'class-validator';

/** Date-time with an explicit offset (`Z` or `±HH:mm`), so the instant is unambiguous (A-7). */
const WITH_OFFSET = /(Z|[+-]\d{2}:\d{2})$/;

export class CreateAppointmentRequestDto {
  @ApiProperty({ format: 'uuid', example: '50000000-0000-4000-8000-000000000001' })
  @IsUUID()
  readonly customerId!: string; // `!`: assigned by ValidationPipe from the body, never constructed

  @ApiProperty({
    format: 'uuid',
    example: '60000000-0000-4000-8000-000000000001',
    description: 'Must belong to the customer (BR-5)',
  })
  @IsUUID()
  readonly vehicleId!: string;

  @ApiProperty({ format: 'uuid', example: '10000000-0000-4000-8000-000000000001' })
  @IsUUID()
  readonly dealershipId!: string;

  @ApiProperty({ format: 'uuid', example: '40000000-0000-4000-8000-000000000001' })
  @IsUUID()
  readonly serviceTypeId!: string;

  @ApiProperty({
    format: 'date-time',
    example: '2030-01-15T10:00:00+07:00',
    description:
      'Desired start, ISO-8601 with offset. End = start + service duration (BR-1); the whole slot ' +
      'must be in the future (BR-3) and within opening hours (BR-4).',
  })
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(WITH_OFFSET, { message: 'start must include a UTC offset (Z or ±HH:mm)' })
  readonly start!: string;
}
