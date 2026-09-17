import { Injectable, type LoggerService } from '@nestjs/common';
import type { LogEntryDto, LogLevel } from '@worship/shared-dto';
import { RequestContextService } from './request-context.service';

@Injectable()
export class StructuredLogger implements LoggerService {
  constructor(private readonly requestContext: RequestContextService) {}

  log(message: unknown, context?: string): void {
    this.write('info', message, context);
  }

  error(message: unknown, trace?: string, context?: string): void {
    this.write('error', message, context, trace ? { trace } : undefined);
  }

  warn(message: unknown, context?: string): void {
    this.write('warn', message, context);
  }

  debug(message: unknown, context?: string): void {
    this.write('debug', message, context);
  }

  verbose(message: unknown, context?: string): void {
    this.write('debug', message, context);
  }

  private write(
    level: LogLevel,
    message: unknown,
    context?: string,
    extra?: Record<string, unknown>,
  ): void {
    const data =
      typeof message === 'object' && message !== null
        ? (message as Record<string, unknown>)
        : undefined;
    const event =
      typeof data?.['event'] === 'string' ? data['event'] : 'application.log';
    const entry: LogEntryDto = {
      timestamp: new Date().toISOString(),
      level,
      context: context ?? 'Application',
      event,
      ...(typeof message === 'string' ? { message } : {}),
      ...(this.requestContext.requestId
        ? { requestId: this.requestContext.requestId }
        : {}),
      ...(data || extra ? { data: { ...data, ...extra } } : {}),
    };
    const output = `${JSON.stringify(entry)}\n`;
    if (level === 'error') process.stderr.write(output);
    else process.stdout.write(output);
  }
}
