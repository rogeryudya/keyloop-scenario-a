import { Controller, Get, Param, Query } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../../../shared/presentation/dto/error-response.dto';
import { IdParamDto } from '../../../shared/presentation/dto/id-param.dto';
import { GetAvailabilityQuery } from '../application/queries/get-availability/get-availability.query';
import { AvailabilityResponseDto } from './dto/availability.response.dto';
import { GetAvailabilityQueryDto } from './dto/get-availability.query.dto';

/** FR-7. Nested under dealerships in the URL, but owned by the appointments module. */
@ApiTags('availability')
@Controller({ path: 'dealerships', version: '1' })
export class AvailabilityController {
  constructor(private readonly queries: QueryBus) {}

  @Get(':id/availability')
  @ApiOkResponse({ type: AvailabilityResponseDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'VALIDATION_FAILED (id or serviceTypeId not a UUID, date not YYYY-MM-DD)',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'DEALERSHIP_NOT_FOUND, SERVICE_TYPE_NOT_FOUND',
  })
  @ApiUnprocessableEntityResponse({
    type: ErrorResponseDto,
    description: 'SERVICE_TYPE_NOT_SUPPORTED',
  })
  async get(
    @Param() { id }: IdParamDto,
    @Query() query: GetAvailabilityQueryDto,
  ): Promise<AvailabilityResponseDto> {
    const view = await this.queries.execute(
      new GetAvailabilityQuery(id, query.serviceTypeId, query.date),
    );
    return AvailabilityResponseDto.from(view);
  }
}
