import {
  CountdownDefinitionSchema,
  MessageResponseSchema,
  type CountdownDefinitionDto,
  type CreateCountdownRequestDto,
  type MessageResponseDto,
  type UpdateCountdownRequestDto,
} from '@worship/shared-dto';
import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class CountdownsApiService {
  private readonly http = inject(HttpClient);

  list(organizationId: string): Observable<CountdownDefinitionDto[]> {
    return this.http
      .get<unknown>(this.base(organizationId))
      .pipe(map((value) => CountdownDefinitionSchema.array().parse(value)));
  }

  create(
    organizationId: string,
    input: CreateCountdownRequestDto,
  ): Observable<CountdownDefinitionDto> {
    return this.http
      .post<unknown>(this.base(organizationId), input)
      .pipe(map((value) => CountdownDefinitionSchema.parse(value)));
  }

  update(
    organizationId: string,
    countdownId: string,
    input: UpdateCountdownRequestDto,
  ): Observable<CountdownDefinitionDto> {
    return this.http
      .patch<unknown>(`${this.base(organizationId)}/${countdownId}`, input)
      .pipe(map((value) => CountdownDefinitionSchema.parse(value)));
  }

  remove(
    organizationId: string,
    countdownId: string,
  ): Observable<MessageResponseDto> {
    return this.http
      .delete<unknown>(`${this.base(organizationId)}/${countdownId}`)
      .pipe(map((value) => MessageResponseSchema.parse(value)));
  }

  private base(organizationId: string): string {
    return `/api/v1/organizations/${organizationId}/countdowns`;
  }
}
