import type { LogEntryDto, LogLevel } from '@worship/shared-dto';
import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class BrowserLogger {
  debug(context: string, event: string, data?: Record<string, unknown>): void {
    this.write('debug', context, event, undefined, data);
  }

  info(context: string, event: string, data?: Record<string, unknown>): void {
    this.write('info', context, event, undefined, data);
  }

  warn(
    context: string,
    event: string,
    message: string,
    data?: Record<string, unknown>,
  ): void {
    this.write('warn', context, event, message, data);
  }

  error(
    context: string,
    event: string,
    message: string,
    data?: Record<string, unknown>,
  ): void {
    this.write('error', context, event, message, data);
  }

  private write(
    level: LogLevel,
    context: string,
    event: string,
    message?: string,
    data?: Record<string, unknown>,
  ): void {
    const entry: LogEntryDto = {
      timestamp: new Date().toISOString(),
      level,
      context,
      event,
      ...(message ? { message } : {}),
      ...(data ? { data } : {}),
    };
    const method =
      level === 'error'
        ? console.error
        : level === 'warn'
          ? console.warn
          : level === 'debug'
            ? console.debug
            : console.info;
    method(entry);
  }
}
