import { ApiErrorSchema } from '@worship/shared-dto';
import { inject } from '@angular/core';
import {
  HttpContextToken,
  HttpErrorResponse,
  type HttpRequest,
  type HttpInterceptorFn,
} from '@angular/common/http';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthSessionStore } from './auth-session.store';
import { AuthTokenRefreshService } from './auth-token-refresh.service';
import { shouldRefreshAccessToken } from './auth-token-expiry';
import { BrowserLogger } from './browser-logger.service';

const RETRIED_AFTER_REFRESH = new HttpContextToken<boolean>(() => false);

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const store = inject(AuthSessionStore);
  const refresh = inject(AuthTokenRefreshService);
  const session = store.session();
  if (!session) return next(request);

  const authenticatedRequest = (accessToken: string) =>
    request.clone({
      setHeaders: { Authorization: `Bearer ${accessToken}` },
    });

  if (
    request.url.includes('/auth/') ||
    !shouldRefreshAccessToken(session.tokens.accessTokenExpiresAt)
  ) {
    return next(authenticatedRequest(session.tokens.accessToken));
  }

  return refresh.refresh().pipe(
    switchMap((refreshedSession) =>
      next(authenticatedRequest(refreshedSession.tokens.accessToken)),
    ),
    catchError((error: unknown) => {
      store.clear();
      return throwError(() => error);
    }),
  );
};

export const apiLoggingInterceptor: HttpInterceptorFn = (request, next) => {
  const logger = inject(BrowserLogger);
  return next(request).pipe(
    catchError((error: unknown) => {
      const body =
        error instanceof HttpErrorResponse
          ? ApiErrorSchema.safeParse(error.error)
          : null;
      logger.error(
        'HTTP',
        'api.request.failed',
        body?.success ? body.data.message : 'API request failed',
        {
          method: request.method,
          url: request.url,
          status: error instanceof HttpErrorResponse ? error.status : 0,
          ...(body?.success
            ? { requestId: body.data.requestId, code: body.data.code }
            : {}),
        },
      );
      return throwError(() => error);
    }),
  );
};

export const authRecoveryInterceptor: HttpInterceptorFn = (request, next) => {
  const refresh = inject(AuthTokenRefreshService);
  const store = inject(AuthSessionStore);
  return next(request).pipe(
    catchError((error: unknown) => {
      if (!shouldRefresh(request, error)) return throwError(() => error);
      return refresh.refresh().pipe(
        switchMap((session) =>
          next(
            request.clone({
              context: request.context.set(RETRIED_AFTER_REFRESH, true),
              setHeaders: { Authorization: `Bearer ${session.tokens.accessToken}` },
            }),
          ),
        ),
        catchError((refreshError: unknown) => {
          store.clear();
          return throwError(() => refreshError);
        }),
      );
    }),
  );
};

function shouldRefresh(
  request: HttpRequest<unknown>,
  error: unknown,
): boolean {
  return (
    error instanceof HttpErrorResponse &&
    error.status === 401 &&
    !request.context.get(RETRIED_AFTER_REFRESH) &&
    !request.url.includes('/auth/')
  );
}
