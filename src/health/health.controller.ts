import { Controller, Get, HttpStatus, Res, VERSION_NEUTRAL } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import {
  ErrorBodyDto,
  ErrorDetailDto,
  ErrorResponseDto,
} from '../shared/presentation/dto/error-response.dto';
import { DatabaseHealthIndicator } from './database.health';
import { HealthResponseDto } from './health-response.dto';

/**
 * Liveness + DB check for load balancers and Compose healthchecks. Operational, so unversioned and
 * outside CQRS. Sets 503 itself: the exception filter turns every unexpected 5xx into a generic 500.
 */
@ApiTags('health')
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private readonly database: DatabaseHealthIndicator,
    private readonly adapterHost: HttpAdapterHost,
  ) {}

  @Get()
  @ApiOkResponse({ type: HealthResponseDto })
  @ApiServiceUnavailableResponse({ type: ErrorResponseDto, description: 'Database unreachable' })
  async check(
    @Res({ passthrough: true }) response: unknown,
  ): Promise<HealthResponseDto | ErrorResponseDto> {
    if (await this.database.isUp()) {
      return new HealthResponseDto();
    }
    this.adapterHost.httpAdapter.status(response, HttpStatus.SERVICE_UNAVAILABLE);
    return new ErrorResponseDto(
      new ErrorBodyDto('SERVICE_UNAVAILABLE', 'Database is unreachable', [
        new ErrorDetailDto('down', 'db'),
      ]),
    );
  }
}
