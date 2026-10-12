import { ApiProperty } from '@nestjs/swagger';
import { Page } from '../../../../shared/application/pagination';
import { PageMetaDto } from '../../../../shared/presentation/dto/page-meta.dto';
import { ServiceTypeView } from '../../application/views/service-type.view';

export class ServiceTypeResponseDto {
  @ApiProperty({ format: 'uuid' })
  readonly id: string;

  @ApiProperty({ example: 'OIL_CHANGE' })
  readonly code: string;

  @ApiProperty({ example: 'Oil and filter change' })
  readonly name: string;

  @ApiProperty({ example: 30, description: 'Appointment length: end = start + duration' })
  readonly durationMinutes: number;

  private constructor(view: ServiceTypeView) {
    this.id = view.id;
    this.code = view.code;
    this.name = view.name;
    this.durationMinutes = view.durationMinutes;
  }

  static from(view: ServiceTypeView): ServiceTypeResponseDto {
    return new ServiceTypeResponseDto(view);
  }
}

export class ServiceTypePageResponseDto {
  @ApiProperty({ type: [ServiceTypeResponseDto] })
  readonly data: readonly ServiceTypeResponseDto[];

  @ApiProperty({ type: PageMetaDto })
  readonly meta: PageMetaDto;

  private constructor(page: Page<ServiceTypeView>, limit: number) {
    this.data = page.items.map((item) => ServiceTypeResponseDto.from(item));
    this.meta = new PageMetaDto(page.nextCursor, limit);
  }

  static from(page: Page<ServiceTypeView>, limit: number): ServiceTypePageResponseDto {
    return new ServiceTypePageResponseDto(page, limit);
  }
}
