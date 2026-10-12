import { Controller, Get, Param, Query } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CursorQueryDto } from '../../../shared/presentation/dto/cursor-query.dto';
import { ErrorResponseDto } from '../../../shared/presentation/dto/error-response.dto';
import { IdParamDto } from '../../../shared/presentation/dto/id-param.dto';
import { GetDealershipQuery } from '../application/queries/get-dealership/get-dealership.query';
import { ListDealershipsQuery } from '../application/queries/list-dealerships/list-dealerships.query';
import {
  DealershipDetailResponseDto,
  DealershipPageResponseDto,
} from './dto/dealership.response.dto';

@ApiTags('dealerships')
@Controller({ path: 'dealerships', version: '1' })
export class DealershipController {
  constructor(private readonly queries: QueryBus) {}

  @Get()
  @ApiOkResponse({ type: DealershipPageResponseDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'VALIDATION_FAILED, INVALID_CURSOR',
  })
  async list(@Query() query: CursorQueryDto): Promise<DealershipPageResponseDto> {
    const request = query.toPageRequest();
    const page = await this.queries.execute(new ListDealershipsQuery(request));
    return DealershipPageResponseDto.from(page, request.limit);
  }

  @Get(':id')
  @ApiOkResponse({ type: DealershipDetailResponseDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'VALIDATION_FAILED (id is not a UUID)',
  })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'DEALERSHIP_NOT_FOUND' })
  async get(@Param() { id }: IdParamDto): Promise<DealershipDetailResponseDto> {
    return DealershipDetailResponseDto.from(await this.queries.execute(new GetDealershipQuery(id)));
  }
}
