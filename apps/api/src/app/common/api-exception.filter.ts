import type { ApiErrorCode, ApiErrorDto } from '@worship/shared-dto';
import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import { RequestContextService } from './request-context.service';
import { StructuredLogger } from './structured-logger.service';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(
    private readonly context: RequestContextService,
    private readonly logger: StructuredLogger,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const raw =
      exception instanceof HttpException ? exception.getResponse() : null;
    const rawMessage =
      typeof raw === 'object' && raw !== null && 'message' in raw
        ? raw.message
        : raw;
    const message = Array.isArray(rawMessage)
      ? rawMessage.join(', ')
      : typeof rawMessage === 'string'
        ? rawMessage
        : exception instanceof Error
          ? exception.message
          : 'Unexpected error';

    const body: ApiErrorDto = {
      statusCode: status,
      code: this.codeFor(status),
      message: status >= 500 ? 'Unexpected server error' : message,
      requestId: this.context.requestId ?? 'unknown',
      timestamp: new Date().toISOString(),
      ...(status === HttpStatus.BAD_REQUEST && raw ? { details: raw } : {}),
    };

    if (status >= 500) {
      this.logger.error(
        {
          event: 'http.exception',
          error:
            exception instanceof Error ? exception.message : String(exception),
        },
        exception instanceof Error ? exception.stack : undefined,
        'ApiExceptionFilter',
      );
    }
    response.status(status).json(body);
  }

  private codeFor(status: number): ApiErrorCode {
    if (status === 401) return 'UNAUTHENTICATED';
    if (status === 403) return 'FORBIDDEN';
    if (status === 404) return 'NOT_FOUND';
    if (status === 409) return 'CONFLICT';
    if (status === 400) return 'VALIDATION_FAILED';
    if (status >= 500) return 'INTERNAL_ERROR';
    return 'BAD_REQUEST';
  }
}
