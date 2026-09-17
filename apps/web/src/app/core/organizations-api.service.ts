import {
  LocationSchema,
  MessageResponseSchema,
  OrganizationOverviewSchema,
  type CreateLocationRequestDto,
  type AddOrganizationMemberRequestDto,
  type LocationDto,
  type MessageResponseDto,
  type OrganizationOverviewDto,
  type UpdateLocationRequestDto,
  type UpdateMemberRolesRequestDto,
} from '@worship/shared-dto';
import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class OrganizationsApiService {
  private readonly http = inject(HttpClient);

  getOverview(organizationId: string): Observable<OrganizationOverviewDto> {
    return this.http
      .get<unknown>(`/api/v1/organizations/${organizationId}`)
      .pipe(map((value) => OrganizationOverviewSchema.parse(value)));
  }

  createLocation(
    organizationId: string,
    input: CreateLocationRequestDto,
  ): Observable<LocationDto> {
    return this.http
      .post<unknown>(`${this.base(organizationId)}/locations`, input)
      .pipe(map((value) => LocationSchema.parse(value)));
  }

  updateLocation(
    organizationId: string,
    locationId: string,
    input: UpdateLocationRequestDto,
  ): Observable<LocationDto> {
    return this.http
      .patch<unknown>(`${this.base(organizationId)}/locations/${locationId}`, input)
      .pipe(map((value) => LocationSchema.parse(value)));
  }

  removeLocation(
    organizationId: string,
    locationId: string,
  ): Observable<MessageResponseDto> {
    return this.http
      .delete<unknown>(`${this.base(organizationId)}/locations/${locationId}`)
      .pipe(map((value) => MessageResponseSchema.parse(value)));
  }

  updateMemberRoles(
    organizationId: string,
    userId: string,
    input: UpdateMemberRolesRequestDto,
  ): Observable<OrganizationOverviewDto> {
    return this.http
      .patch<unknown>(`${this.base(organizationId)}/members/${userId}/roles`, input)
      .pipe(map((value) => OrganizationOverviewSchema.parse(value)));
  }

  addMember(
    organizationId: string,
    input: AddOrganizationMemberRequestDto,
  ): Observable<OrganizationOverviewDto> {
    return this.http
      .post<unknown>(`${this.base(organizationId)}/members`, input)
      .pipe(map((value) => OrganizationOverviewSchema.parse(value)));
  }

  private base(organizationId: string): string {
    return `/api/v1/organizations/${organizationId}`;
  }
}
