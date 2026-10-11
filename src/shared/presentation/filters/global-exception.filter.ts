import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import {
  BusinessRuleError,
  ConflictError,
  DomainError,
  NotFoundError,
  ValidationError,
} from '../../domain/errors';
import { ErrorBodyDto, ErrorDetailDto, ErrorResponseDto } from '../dto/error-response.dto';

export interface HttpError {
  readonly status: number;
  readonly body: ErrorResponseDto;
}

const INTERNAL_MESSAGE = 'An unexpected error occurred';

/** The only place domain errors become HTTP statuses (docs/architecture/presentation.md). */
function statusOf(error: DomainError): number | undefined {
  if (error instanceof ValidationError) return HttpStatus.BAD_REQUEST;
  if (error instanceof NotFoundError) return HttpStatus.NOT_FOUND;
  if (error instanceof ConflictError) return HttpStatus.CONFLICT;
  if (error instanceof BusinessRuleError) return HttpStatus.UNPROCESSABLE_ENTITY;
  return undefined;
}

/** Errors raised before Nest's pipeline (e.g. body-parser on malformed JSON) carry a 4xx `status`. */
function clientStatusOf(exception: unknown): number | undefined {
  if (typeof exception !== 'object' || exception === null) return undefined;
  const status = (exception as { status?: unknown }).status;
  return typeof status === 'number' && status >= 400 && status < 500 ? status : undefined;
}

function codeFor(status: number): string {
  // Enum reverse lookup: typed `string`, but undefined at runtime for unnamed statuses.
  const name: string | undefined = HttpStatus[status];
  return name ?? `HTTP_${status}`;
}

const internalError = (): HttpError => ({
  status: HttpStatus.INTERNAL_SERVER_ERROR,
  body: new ErrorResponseDto(new ErrorBodyDto('INTERNAL_ERROR', INTERNAL_MESSAGE)),
});

/** Pure mapping from anything thrown to the standard error response. Never leaks 5xx internals. */
export function toHttpError(exception: unknown): HttpError {
  if (exception instanceof DomainError) {
    const status = statusOf(exception);
    if (status === undefined) return internalError();
    const details = exception.details.map((d) => new ErrorDetailDto(d.issue, d.field));
    return {
      status,
      body: new ErrorResponseDto(new ErrorBodyDto(exception.code, exception.message, details)),
    };
  }

  const status =
    exception instanceof HttpException ? exception.getStatus() : clientStatusOf(exception);
  if (status === undefined || status >= 500) return internalError();
  const message = exception instanceof Error ? exception.message : codeFor(status);
  return { status, body: new ErrorResponseDto(new ErrorBodyDto(codeFor(status), message)) };
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  constructor(private readonly adapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { status, body } = toHttpError(exception);
    if (status >= 500) {
      this.logger.error(
        exception instanceof Error ? exception.message : 'Non-error thrown',
        exception instanceof Error ? exception.stack : undefined,
      );
    }
    this.adapterHost.httpAdapter.reply(host.switchToHttp().getResponse(), body, status);
  }
}
