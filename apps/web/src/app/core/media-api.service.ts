import {
  MediaAssetSchema,
  MessageResponseSchema,
  type CreateMediaAssetRequestDto,
  type MediaAssetDto,
  type MediaAssetListQueryDto,
  type MessageResponseDto,
  type UpdateMediaAssetRequestDto,
} from '@worship/shared-dto';
import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class MediaApiService {
  private readonly http = inject(HttpClient);

  list(
    organizationId: string,
    query: MediaAssetListQueryDto = {},
  ): Observable<MediaAssetDto[]> {
    let params = new HttpParams();
    if (query.kind) params = params.set('kind', query.kind);
    if (query.search) params = params.set('search', query.search);
    if (query.tag) params = params.set('tag', query.tag);
    return this.http
      .get<unknown>(this.base(organizationId), { params })
      .pipe(map((value) => MediaAssetSchema.array().parse(value)));
  }

  get(organizationId: string, assetId: string): Observable<MediaAssetDto> {
    return this.http
      .get<unknown>(`${this.base(organizationId)}/${assetId}`)
      .pipe(map((value) => MediaAssetSchema.parse(value)));
  }

  create(
    organizationId: string,
    input: CreateMediaAssetRequestDto,
  ): Observable<MediaAssetDto> {
    return this.http
      .post<unknown>(this.base(organizationId), input)
      .pipe(map((value) => MediaAssetSchema.parse(value)));
  }

  update(
    organizationId: string,
    assetId: string,
    input: UpdateMediaAssetRequestDto,
  ): Observable<MediaAssetDto> {
    return this.http
      .patch<unknown>(`${this.base(organizationId)}/${assetId}`, input)
      .pipe(map((value) => MediaAssetSchema.parse(value)));
  }

  remove(
    organizationId: string,
    assetId: string,
  ): Observable<MessageResponseDto> {
    return this.http
      .delete<unknown>(`${this.base(organizationId)}/${assetId}`)
      .pipe(map((value) => MessageResponseSchema.parse(value)));
  }

  private base(organizationId: string): string {
    return `/api/v1/organizations/${organizationId}/media`;
  }
}
