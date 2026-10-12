import { ApiProperty } from '@nestjs/swagger';
import { Page } from '../../../../shared/application/pagination';
import { PageMetaDto } from '../../../../shared/presentation/dto/page-meta.dto';
import { DealershipDetailView, DealershipView } from '../../application/views/dealership.view';

export class OpeningHoursResponseDto {
  @ApiProperty({ example: '08:00', description: 'Local time in the dealership time zone' })
  readonly opensAt: string;

  @ApiProperty({ example: '18:00', description: 'Local time; appointments must end by then' })
  readonly closesAt: string;

  constructor(opensAt: string, closesAt: string) {
    this.opensAt = opensAt;
    this.closesAt = closesAt;
  }
}

export class DealershipResponseDto {
  @ApiProperty({ format: 'uuid' })
  readonly id: string;

  @ApiProperty({ example: 'Keyloop Motors Bangkok' })
  readonly name: string;

  @ApiProperty({ example: 'Asia/Bangkok', description: 'IANA time zone' })
  readonly timeZone: string;

  @ApiProperty({ type: OpeningHoursResponseDto, description: 'Same window every day' })
  readonly openingHours: OpeningHoursResponseDto;

  protected constructor(view: DealershipView) {
    this.id = view.id;
    this.name = view.name;
    this.timeZone = view.timeZone;
    this.openingHours = new OpeningHoursResponseDto(view.opensAt, view.closesAt);
  }

  static from(view: DealershipView): DealershipResponseDto {
    return new DealershipResponseDto(view);
  }
}

export class DealershipDetailResponseDto extends DealershipResponseDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    description: 'Service types this dealership can perform (it has a qualified technician)',
  })
  readonly supportedServiceTypeIds: readonly string[];

  private constructor(view: DealershipDetailView) {
    super(view);
    this.supportedServiceTypeIds = view.supportedServiceTypeIds;
  }

  static override from(view: DealershipDetailView): DealershipDetailResponseDto {
    return new DealershipDetailResponseDto(view);
  }
}

export class DealershipPageResponseDto {
  @ApiProperty({ type: [DealershipResponseDto] })
  readonly data: readonly DealershipResponseDto[];

  @ApiProperty({ type: PageMetaDto })
  readonly meta: PageMetaDto;

  private constructor(page: Page<DealershipView>, limit: number) {
    this.data = page.items.map((item) => DealershipResponseDto.from(item));
    this.meta = new PageMetaDto(page.nextCursor, limit);
  }

  static from(page: Page<DealershipView>, limit: number): DealershipPageResponseDto {
    return new DealershipPageResponseDto(page, limit);
  }
}
