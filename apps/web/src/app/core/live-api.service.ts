import {
  LiveSessionSchema,
  LiveStateSchema,
  type LiveActionRequestDto,
  type LiveSessionDto,
  type LiveStateDto,
} from '@worship/shared-dto';
import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class LiveApiService {
  private readonly http = inject(HttpClient);

  start(organizationId: string, serviceId: string): Observable<LiveSessionDto> {
    return this.http
      .post<unknown>(this.serviceBase(organizationId, serviceId) + '/start', {})
      .pipe(map((value) => LiveSessionSchema.parse(value)));
  }

  get(sessionId: string): Observable<LiveSessionDto> {
    return this.http
      .get<unknown>(this.sessionBase(sessionId))
      .pipe(map((value) => LiveSessionSchema.parse(value)));
  }

  act(
    sessionId: string,
    input: LiveActionRequestDto,
  ): Observable<LiveSessionDto> {
    return this.http
      .post<unknown>(`${this.sessionBase(sessionId)}/actions`, input)
      .pipe(map((value) => LiveSessionSchema.parse(value)));
  }

  getOutputState(sessionId: string, key: string): Observable<LiveStateDto> {
    const params = new HttpParams().set('key', key);
    return this.http
      .get<unknown>(`${this.sessionBase(sessionId)}/state`, { params })
      .pipe(map((value) => LiveStateSchema.parse(value)));
  }

  private serviceBase(organizationId: string, serviceId: string): string {
    return `/api/v1/organizations/${organizationId}/services/${serviceId}/live`;
  }

  private sessionBase(sessionId: string): string {
    return `/api/v1/live-sessions/${sessionId}`;
  }
}
