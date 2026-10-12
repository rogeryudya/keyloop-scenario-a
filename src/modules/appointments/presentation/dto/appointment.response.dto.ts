import { ApiProperty } from '@nestjs/swagger';
import { Page } from '../../../../shared/application/pagination';
import { PageMetaDto } from '../../../../shared/presentation/dto/page-meta.dto';
import { AppointmentView } from '../../application/views/appointment.view';

export class AppointmentIdResponseDto {
  @ApiProperty({ format: 'uuid' })
  readonly id: string;

  constructor(id: string) {
    this.id = id;
  }
}

export class NamedRefDto {
  @ApiProperty({ format: 'uuid' })
  readonly id: string;

  @ApiProperty()
  readonly name: string;

  constructor(ref: { id: string; name: string }) {
    this.id = ref.id;
    this.name = ref.name;
  }
}

export class AppointmentDealershipDto extends NamedRefDto {
  @ApiProperty({ example: 'Asia/Bangkok', description: 'IANA time zone' })
  readonly timeZone: string;

  constructor(ref: AppointmentView['dealership']) {
    super(ref);
    this.timeZone = ref.timeZone;
  }
}

export class AppointmentServiceTypeDto extends NamedRefDto {
  @ApiProperty({ example: 'OIL_CHANGE' })
  readonly code: string;

  @ApiProperty({ example: 30 })
  readonly durationMinutes: number;

  constructor(ref: AppointmentView['serviceType']) {
    super(ref);
    this.code = ref.code;
    this.durationMinutes = ref.durationMinutes;
  }
}

export class AppointmentVehicleDto {
  @ApiProperty({ format: 'uuid' })
  readonly id: string;

  @ApiProperty()
  readonly registration: string;

  @ApiProperty({ example: 'Toyota' })
  readonly make: string;

  @ApiProperty({ example: 'Corolla Altis' })
  readonly model: string;

  constructor(ref: AppointmentView['vehicle']) {
    this.id = ref.id;
    this.registration = ref.registration;
    this.make = ref.make;
    this.model = ref.model;
  }
}

export class AppointmentResponseDto {
  @ApiProperty({ format: 'uuid' })
  readonly id: string;

  @ApiProperty({ enum: ['CONFIRMED', 'CANCELLED'] })
  readonly status: string;

  @ApiProperty({ format: 'date-time', description: 'UTC' })
  readonly start: string;

  @ApiProperty({ format: 'date-time', description: 'UTC; start + service duration (BR-1)' })
  readonly end: string;

  @ApiProperty({ format: 'date-time' })
  readonly createdAt: string;

  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  readonly cancelledAt: string | null;

  @ApiProperty({ type: AppointmentDealershipDto })
  readonly dealership: AppointmentDealershipDto;

  @ApiProperty({ type: NamedRefDto, description: 'Allocated by the system (A-4)' })
  readonly serviceBay: NamedRefDto;

  @ApiProperty({ type: NamedRefDto, description: 'Allocated by the system (A-4)' })
  readonly technician: NamedRefDto;

  @ApiProperty({ type: AppointmentServiceTypeDto })
  readonly serviceType: AppointmentServiceTypeDto;

  @ApiProperty({ type: NamedRefDto })
  readonly customer: NamedRefDto;

  @ApiProperty({ type: AppointmentVehicleDto })
  readonly vehicle: AppointmentVehicleDto;

  private constructor(view: AppointmentView) {
    this.id = view.id;
    this.status = view.status;
    this.start = view.start.toISOString();
    this.end = view.end.toISOString();
    this.createdAt = view.createdAt.toISOString();
    this.cancelledAt = view.cancelledAt?.toISOString() ?? null;
    this.dealership = new AppointmentDealershipDto(view.dealership);
    this.serviceBay = new NamedRefDto(view.serviceBay);
    this.technician = new NamedRefDto(view.technician);
    this.serviceType = new AppointmentServiceTypeDto(view.serviceType);
    this.customer = new NamedRefDto(view.customer);
    this.vehicle = new AppointmentVehicleDto(view.vehicle);
  }

  static from(view: AppointmentView): AppointmentResponseDto {
    return new AppointmentResponseDto(view);
  }
}

export class AppointmentPageResponseDto {
  @ApiProperty({ type: [AppointmentResponseDto] })
  readonly data: readonly AppointmentResponseDto[];

  @ApiProperty({ type: PageMetaDto })
  readonly meta: PageMetaDto;

  private constructor(page: Page<AppointmentView>, limit: number) {
    this.data = page.items.map((item) => AppointmentResponseDto.from(item));
    this.meta = new PageMetaDto(page.nextCursor, limit);
  }

  static from(page: Page<AppointmentView>, limit: number): AppointmentPageResponseDto {
    return new AppointmentPageResponseDto(page, limit);
  }
}
