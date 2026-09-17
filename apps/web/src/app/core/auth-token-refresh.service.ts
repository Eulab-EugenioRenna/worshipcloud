import {
  AuthSessionSchema,
  type AuthSessionDto,
} from '@worship/shared-dto';
import { HttpBackend, HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable, shareReplay, tap } from 'rxjs';
import { AuthSessionStore } from './auth-session.store';

/**
 * Uses HttpBackend so the refresh request never re-enters auth interceptors.
 * A single in-flight refresh is shared by requests that fail together.
 */
@Injectable({ providedIn: 'root' })
export class AuthTokenRefreshService {
  private readonly rawHttp = new HttpClient(inject(HttpBackend));
  private readonly store = inject(AuthSessionStore);
  private refreshRequest?: Observable<AuthSessionDto>;

  refresh(): Observable<AuthSessionDto> {
    const refreshToken = this.store.session()?.tokens.refreshToken;
    if (!refreshToken) {
      this.store.clear();
      throw new Error('No refresh token is available');
    }
    if (!this.refreshRequest) {
      this.refreshRequest = this.rawHttp
        .post<unknown>('/api/v1/auth/refresh', { refreshToken })
        .pipe(
          map((value) => AuthSessionSchema.parse(value)),
          tap({
            next: (session) => this.store.set(session),
            error: () => this.store.clear(),
          }),
          shareReplay({ bufferSize: 1, refCount: false }),
        );
      this.refreshRequest.subscribe({ complete: () => (this.refreshRequest = undefined), error: () => (this.refreshRequest = undefined) });
    }
    return this.refreshRequest;
  }
}
