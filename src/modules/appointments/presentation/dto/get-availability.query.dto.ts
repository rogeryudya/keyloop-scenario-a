import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsUUID, Matches } from 'class-validator';

export class GetAvailabilityQueryDto {
  @ApiProperty({ format: 'uuid', example: '40000000-0000-4000-8000-000000000001' })
  @IsUUID()
  readonly serviceTypeId!: string; // `!`: assigned by ValidationPipe from the query, never constructed

  @ApiProperty({
    format: 'date',
    example: '2030-01-15',
    description: "Calendar date in the dealership's time zone (A-14)",
  })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be in YYYY-MM-DD format' })
  @IsISO8601({ strict: true }, { message: 'date must be a valid calendar date' })
  readonly date!: string;
}
