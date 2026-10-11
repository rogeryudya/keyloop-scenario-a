import { ApiProperty } from '@nestjs/swagger';

export class HealthResponseDto {
  @ApiProperty({ example: 'ok', enum: ['ok'] })
  readonly status = 'ok' as const;

  @ApiProperty({ example: 'up', enum: ['up'] })
  readonly db = 'up' as const;
}
