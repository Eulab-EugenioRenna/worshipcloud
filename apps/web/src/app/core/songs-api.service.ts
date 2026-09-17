import {
  MessageResponseSchema,
  ImportSongsResponseSchema,
  ImportSourceSchema,
  SongSchema,
  SongTranslationSchema,
  SongVisualSlideSchema,
  type CreateSongRequestDto,
  type GenerateSongTranslationRequestDto,
  type ImportSourceDto,
  type SongImportCommandDto,
  type ImportSongsResponseDto,
  type MessageResponseDto,
  type ReplaceSongArrangementsRequestDto,
  type ReplaceSongSectionStepsRequestDto,
  type SongDto,
  type SongListQueryDto,
  type SongTranslationDto,
  type SongTranslationInputDto,
  type SongVisualSlideDto,
  type SongVisualSlideInputDto,
  type UpdateSongVisualSlideRequestDto,
  type UpdateSongRequestDto,
} from '@worship/shared-dto';
import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SongsApiService {
  private readonly http = inject(HttpClient);

  importSongs(
    organizationId: string,
    input: SongImportCommandDto,
  ): Observable<ImportSongsResponseDto> {
    return this.http
      .post<unknown>(`${this.base(organizationId)}/import`, input)
      .pipe(map((value) => ImportSongsResponseSchema.parse(value)));
  }

  listImportSources(organizationId: string): Observable<ImportSourceDto[]> {
    return this.http
      .get<unknown>(`${this.base(organizationId)}/import/sources`)
      .pipe(map((value) => ImportSourceSchema.array().parse(value)));
  }

  list(
    organizationId: string,
    query: SongListQueryDto = {},
  ): Observable<SongDto[]> {
    let params = new HttpParams();
    if (query.search) params = params.set('search', query.search);
    return this.http
      .get<unknown>(this.base(organizationId), { params })
      .pipe(map((value) => SongSchema.array().parse(value)));
  }

  get(organizationId: string, songId: string): Observable<SongDto> {
    return this.http
      .get<unknown>(`${this.base(organizationId)}/${songId}`)
      .pipe(map((value) => SongSchema.parse(value)));
  }

  create(
    organizationId: string,
    input: CreateSongRequestDto,
  ): Observable<SongDto> {
    return this.http
      .post<unknown>(this.base(organizationId), input)
      .pipe(map((value) => SongSchema.parse(value)));
  }

  update(
    organizationId: string,
    songId: string,
    input: UpdateSongRequestDto,
  ): Observable<SongDto> {
    return this.http
      .patch<unknown>(`${this.base(organizationId)}/${songId}`, input)
      .pipe(map((value) => SongSchema.parse(value)));
  }

  regenerateSteps(organizationId: string, songId: string): Observable<SongDto> {
    return this.http
      .post<unknown>(`${this.base(organizationId)}/${songId}/steps/regenerate`, {})
      .pipe(map((value) => SongSchema.parse(value)));
  }

  replaceSectionSteps(
    organizationId: string,
    songId: string,
    sectionId: string,
    input: ReplaceSongSectionStepsRequestDto,
  ): Observable<SongDto> {
    return this.http
      .put<unknown>(
        `${this.base(organizationId)}/${songId}/sections/${sectionId}/steps`,
        input,
      )
      .pipe(map((value) => SongSchema.parse(value)));
  }

  replaceArrangements(
    organizationId: string,
    songId: string,
    input: ReplaceSongArrangementsRequestDto,
  ): Observable<SongDto> {
    return this.http
      .patch<unknown>(
        `${this.base(organizationId)}/${songId}/arrangements`,
        input,
      )
      .pipe(map((value) => SongSchema.parse(value)));
  }

  remove(
    organizationId: string,
    songId: string,
  ): Observable<MessageResponseDto> {
    return this.http
      .delete<unknown>(`${this.base(organizationId)}/${songId}`)
      .pipe(map((value) => MessageResponseSchema.parse(value)));
  }

  listTranslations(
    organizationId: string,
    songId: string,
  ): Observable<SongTranslationDto[]> {
    return this.http
      .get<unknown>(`${this.base(organizationId)}/${songId}/translations`)
      .pipe(map((value) => SongTranslationSchema.array().parse(value)));
  }

  upsertTranslation(
    organizationId: string,
    songId: string,
    input: SongTranslationInputDto,
  ): Observable<SongTranslationDto> {
    return this.http
      .put<unknown>(
        `${this.base(organizationId)}/${songId}/translations/${encodeURIComponent(input.locale)}`,
        input,
      )
      .pipe(map((value) => SongTranslationSchema.parse(value)));
  }

  generateTranslation(
    organizationId: string,
    songId: string,
    input: GenerateSongTranslationRequestDto,
  ): Observable<SongTranslationDto> {
    return this.http
      .post<unknown>(
        `${this.base(organizationId)}/${songId}/translations/generate`,
        input,
      )
      .pipe(map((value) => SongTranslationSchema.parse(value)));
  }

  listVisualSlides(
    organizationId: string,
    songId: string,
  ): Observable<SongVisualSlideDto[]> {
    return this.http
      .get<unknown>(`${this.base(organizationId)}/${songId}/visual-slides`)
      .pipe(map((value) => SongVisualSlideSchema.array().parse(value)));
  }

  createVisualSlide(
    organizationId: string,
    songId: string,
    input: SongVisualSlideInputDto,
  ): Observable<SongVisualSlideDto> {
    return this.http
      .post<unknown>(
        `${this.base(organizationId)}/${songId}/visual-slides`,
        input,
      )
      .pipe(map((value) => SongVisualSlideSchema.parse(value)));
  }

  updateVisualSlide(
    organizationId: string,
    songId: string,
    visualSlideId: string,
    input: UpdateSongVisualSlideRequestDto,
  ): Observable<SongVisualSlideDto> {
    return this.http
      .patch<unknown>(
        `${this.base(organizationId)}/${songId}/visual-slides/${visualSlideId}`,
        input,
      )
      .pipe(map((value) => SongVisualSlideSchema.parse(value)));
  }

  removeVisualSlide(
    organizationId: string,
    songId: string,
    visualSlideId: string,
  ): Observable<MessageResponseDto> {
    return this.http
      .delete<unknown>(
        `${this.base(organizationId)}/${songId}/visual-slides/${visualSlideId}`,
      )
      .pipe(map((value) => MessageResponseSchema.parse(value)));
  }

  private base(organizationId: string): string {
    return `/api/v1/organizations/${organizationId}/songs`;
  }
}
