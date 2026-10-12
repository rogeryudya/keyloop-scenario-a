import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';
import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT, PageRequest } from '../../application/pagination';

/** `?limit=&cursor=` on every list endpoint (docs/conventions.md › API). */
export class CursorQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_LIMIT, default: DEFAULT_PAGE_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_LIMIT)
  readonly limit?: number;

  @ApiPropertyOptional({ description: 'Opaque `meta.nextCursor` from the previous page' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  readonly cursor?: string;

  toPageRequest(): PageRequest {
    const limit = this.limit ?? DEFAULT_PAGE_LIMIT;
    return this.cursor === undefined ? { limit } : { limit, cursor: this.cursor };
  }
}
