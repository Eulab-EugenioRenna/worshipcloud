import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { RequestContextService } from './request-context.service';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly context: RequestContextService) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const incomingId = request.header('x-request-id');
    const requestId = incomingId?.trim() || randomUUID();
    response.setHeader('x-request-id', requestId);
    this.context.run(requestId, next);
  }
}
