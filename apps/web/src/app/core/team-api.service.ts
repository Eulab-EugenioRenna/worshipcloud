import {
  MessageResponseSchema,
  ServiceTeamAssignmentSchema,
  type CreateServiceTeamAssignmentRequestDto,
  type MessageResponseDto,
  MyServiceTeamAssignmentSchema,
  type MyServiceTeamAssignmentDto,
  type ServiceTeamAssignmentDto,
  type UpdateServiceTeamAssignmentRequestDto,
} from '@worship/shared-dto';
import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class TeamApiService {
  private readonly http = inject(HttpClient);

  list(
    organizationId: string,
    serviceId: string,
  ): Observable<ServiceTeamAssignmentDto[]> {
    return this.http
      .get<unknown>(this.base(organizationId, serviceId))
      .pipe(map((value) => ServiceTeamAssignmentSchema.array().parse(value)));
  }

  listMine(organizationId: string): Observable<MyServiceTeamAssignmentDto[]> {
    return this.http
      .get<unknown>(`/api/v1/organizations/${organizationId}/my-team-assignments`)
      .pipe(map((value) => MyServiceTeamAssignmentSchema.array().parse(value)));
  }

  assign(
    organizationId: string,
    serviceId: string,
    input: CreateServiceTeamAssignmentRequestDto,
  ): Observable<ServiceTeamAssignmentDto> {
    return this.http
      .post<unknown>(this.base(organizationId, serviceId), input)
      .pipe(map((value) => ServiceTeamAssignmentSchema.parse(value)));
  }

  update(
    organizationId: string,
    serviceId: string,
    assignmentId: string,
    input: UpdateServiceTeamAssignmentRequestDto,
  ): Observable<ServiceTeamAssignmentDto> {
    return this.http
      .patch<unknown>(
        `${this.base(organizationId, serviceId)}/${assignmentId}`,
        input,
      )
      .pipe(map((value) => ServiceTeamAssignmentSchema.parse(value)));
  }

  remove(
    organizationId: string,
    serviceId: string,
    assignmentId: string,
  ): Observable<MessageResponseDto> {
    return this.http
      .delete<unknown>(`${this.base(organizationId, serviceId)}/${assignmentId}`)
      .pipe(map((value) => MessageResponseSchema.parse(value)));
  }

  private base(organizationId: string, serviceId: string): string {
    return `/api/v1/organizations/${organizationId}/services/${serviceId}/team`;
  }
}
