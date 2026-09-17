import {
  AuthSessionSchema,
  CurrentUserSchema,
  MessageResponseSchema,
  type AuthSessionDto,
  type CurrentUserDto,
  type LoginRequestDto,
  type MessageResponseDto,
  type RegisterRequestDto,
} from '@worship/shared-dto';
import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { finalize, map, Observable, tap } from 'rxjs';
import { AuthSessionStore } from './auth-session.store';

@Injectable({ providedIn: 'root' })
export class AuthApiService {
  private readonly http = inject(HttpClient);
  private readonly store = inject(AuthSessionStore);

  register(input: RegisterRequestDto): Observable<AuthSessionDto> {
    return this.sessionRequest('/api/v1/auth/register', input);
  }

  login(input: LoginRequestDto): Observable<AuthSessionDto> {
    return this.sessionRequest('/api/v1/auth/login', input);
  }

  refresh(): Observable<AuthSessionDto> {
    const refreshToken = this.store.session()?.tokens.refreshToken;
    if (!refreshToken) throw new Error('No refresh token is available');
    return this.sessionRequest('/api/v1/auth/refresh', { refreshToken });
  }

  me(): Observable<CurrentUserDto> {
    return this.http
      .get<unknown>('/api/v1/auth/me')
      .pipe(map((value) => CurrentUserSchema.parse(value)));
  }

  logout(): Observable<MessageResponseDto> {
    const refreshToken = this.store.session()?.tokens.refreshToken;
    return this.http
      .post<unknown>('/api/v1/auth/logout', { refreshToken })
      .pipe(
        map((value) => MessageResponseSchema.parse(value)),
        // Local logout must never leave an expired or already-revoked session in the browser.
        finalize(() => this.store.clear()),
      );
  }

  private sessionRequest(
    url: string,
    body: unknown,
  ): Observable<AuthSessionDto> {
    return this.http.post<unknown>(url, body).pipe(
      map((value) => AuthSessionSchema.parse(value)),
      tap((session) => this.store.set(session)),
    );
  }
}
