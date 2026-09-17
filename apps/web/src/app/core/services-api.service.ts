import {
  LineupItemSchema,
  LineupItemListSchema,
  MessageResponseSchema,
  ServiceListResponseSchema,
  ServiceSchema,
  type CreateLineupItemRequestDto,
  type CreateLineupVisualSlideRequestDto,
  type CreateServiceRequestDto,
  type LineupItemDto,
  type LineupItemListDto,
  LineupVisualSlideSchema,
  type LineupVisualSlideDto,
  type MessageResponseDto,
  type ReorderLineupRequestDto,
  type ServiceDto,
  type ServiceListQueryDto,
  type ServiceListResponseDto,
  type UpdateLineupItemRequestDto,
  type UpdateLineupVisualSlideRequestDto,
  type UpdateServiceRequestDto,
} from '@worship/shared-dto';
import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ServicesApiService {
  private readonly http = inject(HttpClient);

  list(
    organizationId: string,
    query: ServiceListQueryDto = {},
  ): Observable<ServiceListResponseDto> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query))
      if (value) params = params.set(key, value);
    return this.http
      .get<unknown>(this.base(organizationId), { params })
      .pipe(map((value) => ServiceListResponseSchema.parse(value)));
  }

  get(organizationId: string, serviceId: string): Observable<ServiceDto> {
    return this.http
      .get<unknown>(`${this.base(organizationId)}/${serviceId}`)
      .pipe(map((value) => ServiceSchema.parse(value)));
  }

  create(
    organizationId: string,
    input: CreateServiceRequestDto,
  ): Observable<ServiceDto> {
    return this.http
      .post<unknown>(this.base(organizationId), input)
      .pipe(map((value) => ServiceSchema.parse(value)));
  }

  update(
    organizationId: string,
    serviceId: string,
    input: UpdateServiceRequestDto,
  ): Observable<ServiceDto> {
    return this.http
      .patch<unknown>(`${this.base(organizationId)}/${serviceId}`, input)
      .pipe(map((value) => ServiceSchema.parse(value)));
  }

  remove(
    organizationId: string,
    serviceId: string,
  ): Observable<MessageResponseDto> {
    return this.http
      .delete<unknown>(`${this.base(organizationId)}/${serviceId}`)
      .pipe(map((value) => MessageResponseSchema.parse(value)));
  }

  addLineupItem(
    organizationId: string,
    serviceId: string,
    input: CreateLineupItemRequestDto,
  ): Observable<LineupItemDto> {
    return this.http
      .post<unknown>(`${this.base(organizationId)}/${serviceId}/lineup`, input)
      .pipe(map((value) => LineupItemSchema.parse(value)));
  }

  updateLineupItem(
    organizationId: string,
    serviceId: string,
    itemId: string,
    input: UpdateLineupItemRequestDto,
  ): Observable<LineupItemDto> {
    return this.http
      .patch<unknown>(
        `${this.base(organizationId)}/${serviceId}/lineup/${itemId}`,
        input,
      )
      .pipe(map((value) => LineupItemSchema.parse(value)));
  }

  duplicateLineupItem(
    organizationId: string,
    serviceId: string,
    itemId: string,
  ): Observable<LineupItemDto> {
    return this.http
      .post<unknown>(`${this.base(organizationId)}/${serviceId}/lineup/${itemId}/duplicate`, {})
      .pipe(map((value) => LineupItemSchema.parse(value)));
  }

  removeLineupItem(
    organizationId: string,
    serviceId: string,
    itemId: string,
  ): Observable<MessageResponseDto> {
    return this.http
      .delete<unknown>(
        `${this.base(organizationId)}/${serviceId}/lineup/${itemId}`,
      )
      .pipe(map((value) => MessageResponseSchema.parse(value)));
  }

  reorderLineup(
    organizationId: string,
    serviceId: string,
    input: ReorderLineupRequestDto,
  ): Observable<LineupItemListDto> {
    return this.http
      .post<unknown>(
        `${this.base(organizationId)}/${serviceId}/lineup/reorder`,
        input,
      )
      .pipe(map((value) => LineupItemListSchema.parse(value)));
  }

  listLineupVisualSlides(organizationId: string, serviceId: string, itemId: string): Observable<LineupVisualSlideDto[]> {
    return this.http.get<unknown>(`${this.base(organizationId)}/${serviceId}/lineup/${itemId}/visual-slides`)
      .pipe(map((value) => LineupVisualSlideSchema.array().parse(value)));
  }

  createLineupVisualSlide(organizationId: string, serviceId: string, itemId: string, input: CreateLineupVisualSlideRequestDto): Observable<LineupVisualSlideDto> {
    return this.http.post<unknown>(`${this.base(organizationId)}/${serviceId}/lineup/${itemId}/visual-slides`, input)
      .pipe(map((value) => LineupVisualSlideSchema.parse(value)));
  }

  updateLineupVisualSlide(organizationId: string, serviceId: string, itemId: string, visualSlideId: string, input: UpdateLineupVisualSlideRequestDto): Observable<LineupVisualSlideDto> {
    return this.http.patch<unknown>(`${this.base(organizationId)}/${serviceId}/lineup/${itemId}/visual-slides/${visualSlideId}`, input)
      .pipe(map((value) => LineupVisualSlideSchema.parse(value)));
  }

  removeLineupVisualSlide(organizationId: string, serviceId: string, itemId: string, visualSlideId: string): Observable<MessageResponseDto> {
    return this.http.delete<unknown>(`${this.base(organizationId)}/${serviceId}/lineup/${itemId}/visual-slides/${visualSlideId}`)
      .pipe(map((value) => MessageResponseSchema.parse(value)));
  }

  private base(organizationId: string): string {
    return `/api/v1/organizations/${organizationId}/services`;
  }
}
