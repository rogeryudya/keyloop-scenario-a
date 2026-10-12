import { Controller, Get, Query } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiBadRequestResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CursorQueryDto } from '../../../shared/presentation/dto/cursor-query.dto';
import { ErrorResponseDto } from '../../../shared/presentation/dto/error-response.dto';
import { ListServiceTypesQuery } from '../application/queries/list-service-types/list-service-types.query';
import { ServiceTypePageResponseDto } from './dto/service-type.response.dto';

@ApiTags('service-types')
@Controller({ path: 'service-types', version: '1' })
export class ServiceTypeController {
  constructor(private readonly queries: QueryBus) {}

  @Get()
  @ApiOkResponse({ type: ServiceTypePageResponseDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'VALIDATION_FAILED, INVALID_CURSOR',
  })
  async list(@Query() query: CursorQueryDto): Promise<ServiceTypePageResponseDto> {
    const request = query.toPageRequest();
    const page = await this.queries.execute(new ListServiceTypesQuery(request));
    return ServiceTypePageResponseDto.from(page, request.limit);
  }
}
