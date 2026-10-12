import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/** `:id` route parameter: a malformed id is 400 `VALIDATION_FAILED`, not 404. */
export class IdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  readonly id!: string; // `!`: assigned by ValidationPipe from the route params, never constructed
}
