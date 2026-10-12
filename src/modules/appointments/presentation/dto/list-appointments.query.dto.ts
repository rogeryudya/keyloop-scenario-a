import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDefined, IsISO8601, IsOptional, IsUUID, Matches, ValidateIf } from 'class-validator';
import { CursorQueryDto } from '../../../../shared/presentation/dto/cursor-query.dto';
import { AppointmentFilter } from '../../application/ports/appointment-read-model';
import { WITH_OFFSET } from './create-appointment.request.dto';

/** `GET /v1/appointments`: at least one of `dealershipId` / `customerId` (A-15). */
export class ListAppointmentsQueryDto extends CursorQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Required unless customerId is given' })
  @IsOptional()
  @IsUUID()
  readonly dealershipId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Required unless dealershipId is given' })
  @ValidateIf(
    (dto: ListAppointmentsQueryDto) =>
      dto.dealershipId === undefined || dto.customerId !== undefined,
  )
  @IsDefined({ message: 'customerId or dealershipId is required' })
  @IsUUID()
  readonly customerId?: string;

  @ApiPropertyOptional({
    format: 'date-time',
    example: '2030-01-15T00:00:00+07:00',
    description: 'Only appointments starting at or after this instant (ISO-8601 with offset)',
  })
  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(WITH_OFFSET, { message: 'from must include a UTC offset (Z or ±HH:mm)' })
  readonly from?: string;

  @ApiPropertyOptional({
    format: 'date-time',
    example: '2030-01-16T00:00:00+07:00',
    description: 'Only appointments starting before this instant (exclusive)',
  })
  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(WITH_OFFSET, { message: 'to must include a UTC offset (Z or ±HH:mm)' })
  readonly to?: string;

  toFilter(): AppointmentFilter {
    return {
      ...(this.dealershipId !== undefined && { dealershipId: this.dealershipId }),
      ...(this.customerId !== undefined && { customerId: this.customerId }),
      ...(this.from !== undefined && { startFrom: new Date(this.from) }),
      ...(this.to !== undefined && { startBefore: new Date(this.to) }),
    };
  }
}
