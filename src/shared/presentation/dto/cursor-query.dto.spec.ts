import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CursorQueryDto } from './cursor-query.dto';

const parse = (query: Record<string, string>): { dto: CursorQueryDto; invalid: string[] } => {
  const dto = plainToInstance(CursorQueryDto, query);
  return { dto, invalid: validateSync(dto).map((e) => e.property) };
};

describe('CursorQueryDto', () => {
  it('defaults to limit 20 and no cursor', () => {
    const { dto, invalid } = parse({});

    expect(invalid).toEqual([]);
    expect(dto.toPageRequest()).toEqual({ limit: 20 });
  });

  it('parses limit from the query string and keeps the cursor', () => {
    const { dto, invalid } = parse({ limit: '5', cursor: 'abc' });

    expect(invalid).toEqual([]);
    expect(dto.toPageRequest()).toEqual({ limit: 5, cursor: 'abc' });
  });

  it.each(['1', '100'])('accepts the boundary limit %s', (limit) => {
    expect(parse({ limit }).invalid).toEqual([]);
  });

  it.each(['0', '101', '-1', '2.5', 'ten'])('rejects limit %p', (limit) => {
    expect(parse({ limit }).invalid).toEqual(['limit']);
  });

  it('rejects an empty cursor', () => {
    expect(parse({ cursor: '' }).invalid).toEqual(['cursor']);
  });
});
