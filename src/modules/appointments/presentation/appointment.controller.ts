import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { ServerResponse } from 'node:http';
import { ErrorResponseDto } from '../../../shared/presentation/dto/error-response.dto';
import { IdParamDto } from '../../../shared/presentation/dto/id-param.dto';
import { CancelAppointmentCommand } from '../application/commands/cancel-appointment/cancel-appointment.command';
import { CreateAppointmentCommand } from '../application/commands/create-appointment/create-appointment.command';
import { GetAppointmentQuery } from '../application/queries/get-appointment/get-appointment.query';
import { ListAppointmentsQuery } from '../application/queries/list-appointments/list-appointments.query';
import {
  AppointmentIdResponseDto,
  AppointmentPageResponseDto,
  AppointmentResponseDto,
} from './dto/appointment.response.dto';
import { CreateAppointmentRequestDto } from './dto/create-appointment.request.dto';
import { ListAppointmentsQueryDto } from './dto/list-appointments.query.dto';

@ApiTags('appointments')
@Controller({ path: 'appointments', version: '1' })
export class AppointmentController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({
    type: AppointmentIdResponseDto,
    description: 'Booked; `Location` header points to the new appointment',
  })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED' })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description:
      'DEALERSHIP_NOT_FOUND, SERVICE_TYPE_NOT_FOUND, CUSTOMER_NOT_FOUND, VEHICLE_NOT_FOUND',
  })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'NO_SERVICE_BAY_AVAILABLE, NO_TECHNICIAN_AVAILABLE, APPOINTMENT_CONFLICT',
  })
  @ApiUnprocessableEntityResponse({
    type: ErrorResponseDto,
    description:
      'APPOINTMENT_IN_PAST, OUTSIDE_OPENING_HOURS, VEHICLE_NOT_OWNED_BY_CUSTOMER, ' +
      'SERVICE_TYPE_NOT_SUPPORTED',
  })
  async create(
    @Body() dto: CreateAppointmentRequestDto,
    @Res({ passthrough: true }) res: ServerResponse,
  ): Promise<AppointmentIdResponseDto> {
    const { id } = await this.commands.execute(
      new CreateAppointmentCommand(
        dto.customerId,
        dto.vehicleId,
        dto.dealershipId,
        dto.serviceTypeId,
        new Date(dto.start),
      ),
    );
    res.setHeader('Location', `/v1/appointments/${id}`);
    return new AppointmentIdResponseDto(id);
  }

  @Get()
  @ApiOkResponse({
    type: AppointmentPageResponseDto,
    description: 'Newest first (createdAt DESC, id DESC); cancelled appointments included (FR-9)',
  })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'VALIDATION_FAILED (e.g. neither dealershipId nor customerId), INVALID_CURSOR',
  })
  async list(@Query() query: ListAppointmentsQueryDto): Promise<AppointmentPageResponseDto> {
    const request = query.toPageRequest();
    const page = await this.queries.execute(new ListAppointmentsQuery(query.toFilter(), request));
    return AppointmentPageResponseDto.from(page, request.limit);
  }

  @Get(':id')
  @ApiOkResponse({ type: AppointmentResponseDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'VALIDATION_FAILED (id is not a UUID)',
  })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'APPOINTMENT_NOT_FOUND' })
  async get(@Param() { id }: IdParamDto): Promise<AppointmentResponseDto> {
    return AppointmentResponseDto.from(await this.queries.execute(new GetAppointmentQuery(id)));
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: AppointmentResponseDto,
    description: 'Cancelled; the bay and technician are free again (FR-8, BR-9)',
  })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'VALIDATION_FAILED (id is not a UUID)',
  })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'APPOINTMENT_NOT_FOUND' })
  @ApiUnprocessableEntityResponse({
    type: ErrorResponseDto,
    description: 'APPOINTMENT_NOT_CANCELLABLE (already cancelled, BR-12)',
  })
  async cancel(@Param() { id }: IdParamDto): Promise<AppointmentResponseDto> {
    await this.commands.execute(new CancelAppointmentCommand(id));
    return AppointmentResponseDto.from(await this.queries.execute(new GetAppointmentQuery(id)));
  }
}
