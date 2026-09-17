import {
  MessageResponseSchema,
  SlideDocumentSchema,
  SlideTemplateSchema,
  type CreateSlideRequestDto,
  type CreateSlideTemplateRequestDto,
  type MessageResponseDto,
  type SlideDocumentDto,
  type SlideListQueryDto,
  type SlideTemplateDto,
  type UpdateSlideRequestDto,
  type UpdateSlideTemplateRequestDto,
} from '@worship/shared-dto';
import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SlidesApiService {
  private readonly http = inject(HttpClient);

  list(organizationId: string, query: SlideListQueryDto = {}): Observable<SlideDocumentDto[]> {
    let params = new HttpParams();
    if (query.search) params = params.set('search', query.search);
    return this.http
      .get<unknown>(this.slidesBase(organizationId), { params })
      .pipe(map((value) => SlideDocumentSchema.array().parse(value)));
  }

  get(organizationId: string, slideId: string): Observable<SlideDocumentDto> {
    return this.http
      .get<unknown>(`${this.slidesBase(organizationId)}/${slideId}`)
      .pipe(map((value) => SlideDocumentSchema.parse(value)));
  }

  create(organizationId: string, input: CreateSlideRequestDto): Observable<SlideDocumentDto> {
    return this.http
      .post<unknown>(this.slidesBase(organizationId), input)
      .pipe(map((value) => SlideDocumentSchema.parse(value)));
  }

  update(organizationId: string, slideId: string, input: UpdateSlideRequestDto): Observable<SlideDocumentDto> {
    return this.http
      .patch<unknown>(`${this.slidesBase(organizationId)}/${slideId}`, input)
      .pipe(map((value) => SlideDocumentSchema.parse(value)));
  }

  remove(organizationId: string, slideId: string): Observable<MessageResponseDto> {
    return this.http
      .delete<unknown>(`${this.slidesBase(organizationId)}/${slideId}`)
      .pipe(map((value) => MessageResponseSchema.parse(value)));
  }

  listTemplates(organizationId: string): Observable<SlideTemplateDto[]> {
    return this.http
      .get<unknown>(this.templatesBase(organizationId))
      .pipe(map((value) => SlideTemplateSchema.array().parse(value)));
  }

  createTemplate(organizationId: string, input: CreateSlideTemplateRequestDto): Observable<SlideTemplateDto> {
    return this.http
      .post<unknown>(this.templatesBase(organizationId), input)
      .pipe(map((value) => SlideTemplateSchema.parse(value)));
  }

  updateTemplate(organizationId: string, templateId: string, input: UpdateSlideTemplateRequestDto): Observable<SlideTemplateDto> {
    return this.http
      .patch<unknown>(`${this.templatesBase(organizationId)}/${templateId}`, input)
      .pipe(map((value) => SlideTemplateSchema.parse(value)));
  }

  removeTemplate(organizationId: string, templateId: string): Observable<MessageResponseDto> {
    return this.http
      .delete<unknown>(`${this.templatesBase(organizationId)}/${templateId}`)
      .pipe(map((value) => MessageResponseSchema.parse(value)));
  }

  private slidesBase(organizationId: string): string {
    return `/api/v1/organizations/${organizationId}/slides`;
  }

  private templatesBase(organizationId: string): string {
    return `/api/v1/organizations/${organizationId}/slide-templates`;
  }
}
