import { ApiProperty } from '@nestjs/swagger';

/** `meta` of every list response (docs/conventions.md › API). */
export class PageMetaDto {
  @ApiProperty({
    type: String,
    nullable: true,
    description: '`null` when there are no more results',
  })
  readonly nextCursor: string | null;

  @ApiProperty({ example: 20 })
  readonly limit: number;

  constructor(nextCursor: string | null, limit: number) {
    this.nextCursor = nextCursor;
    this.limit = limit;
  }
}
