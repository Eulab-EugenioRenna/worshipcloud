import type { AuthPrincipalDto } from '@worship/shared-dto';
import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthPrincipalDto => {
    const request = context
      .switchToHttp()
      .getRequest<Request & { principal?: AuthPrincipalDto }>();
    if (!request.principal) throw new UnauthorizedException();
    return request.principal;
  },
);
