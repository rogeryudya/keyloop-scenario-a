import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ErrorDetailDto {
  @ApiPropertyOptional({ example: 'startTime' })
  readonly field?: string;

  @ApiProperty({ example: 'must be in the future' })
  readonly issue: string;

  constructor(issue: string, field?: string) {
    this.issue = issue;
    if (field !== undefined) this.field = field;
  }
}

export class ErrorBodyDto {
  @ApiProperty({ example: 'APPOINTMENT_CONFLICT', description: 'Stable UPPER_SNAKE_CASE code' })
  readonly code: string;

  @ApiProperty({ example: 'Human readable message' })
  readonly message: string;

  @ApiProperty({ type: [ErrorDetailDto] })
  readonly details: readonly ErrorDetailDto[];

  constructor(code: string, message: string, details: readonly ErrorDetailDto[] = []) {
    this.code = code;
    this.message = message;
    this.details = details;
  }
}

/** The only error shape the API returns (docs/conventions.md › Errors). */
export class ErrorResponseDto {
  @ApiProperty({ type: ErrorBodyDto })
  readonly error: ErrorBodyDto;

  constructor(error: ErrorBodyDto) {
    this.error = error;
  }
}
