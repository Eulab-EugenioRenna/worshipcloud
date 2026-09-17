import {
  BiblePassageSchema,
  BiblePassageTranslationSchema,
  BibleTranslationSchema,
  ImportBibleResponseSchema,
  ImportSourceSchema,
  MessageResponseSchema,
  type BiblePassageDto,
  type BibleImportCommandDto,
  type BiblePassageTranslationDto,
  type BibleSearchQueryDto,
  type BibleTranslationDto,
  type CreateBiblePassageRequestDto,
  type CreateBibleTranslationRequestDto,
  type GenerateBiblePassageTranslationRequestDto,
  type ImportBibleVersesRequestDto,
  type ImportSourceDto,
  type ImportBibleResponseDto,
  type MessageResponseDto,
} from '@worship/shared-dto';
import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { z } from 'zod';

@Injectable({ providedIn: 'root' })
export class BibleApiService {
  private readonly http = inject(HttpClient);

  importBible(
    organizationId: string,
    input: BibleImportCommandDto,
  ): Observable<ImportBibleResponseDto> {
    return this.http
      .post<unknown>(`${this.base(organizationId)}/import`, input)
      .pipe(map((value) => ImportBibleResponseSchema.parse(value)));
  }

  listImportSources(organizationId: string): Observable<ImportSourceDto[]> {
    return this.http
      .get<unknown>(`${this.base(organizationId)}/import/sources`)
      .pipe(map((value) => ImportSourceSchema.array().parse(value)));
  }

  listTranslations(organizationId: string): Observable<BibleTranslationDto[]> {
    return this.http
      .get<unknown>(`${this.base(organizationId)}/translations`)
      .pipe(map((value) => BibleTranslationSchema.array().parse(value)));
  }

  createTranslation(
    organizationId: string,
    input: CreateBibleTranslationRequestDto,
  ): Observable<BibleTranslationDto> {
    return this.http
      .post<unknown>(`${this.base(organizationId)}/translations`, input)
      .pipe(map((value) => BibleTranslationSchema.parse(value)));
  }

  importVerses(
    organizationId: string,
    translationId: string,
    input: ImportBibleVersesRequestDto,
  ): Observable<MessageResponseDto> {
    return this.http
      .post<unknown>(
        `${this.base(organizationId)}/translations/${translationId}/verses/import`,
        input,
      )
      .pipe(map((value) => MessageResponseSchema.parse(value)));
  }

  search(
    organizationId: string,
    query: BibleSearchQueryDto,
  ): Observable<BiblePassageDto> {
    const params = new HttpParams()
      .set('translationId', query.translationId)
      .set('query', query.query);
    return this.http
      .get<unknown>(`${this.base(organizationId)}/search`, { params })
      .pipe(map((value) => BiblePassageSchema.parse(value)));
  }

  listBooks(
    organizationId: string,
    translationId: string,
  ): Observable<string[]> {
    return this.http
      .get<unknown>(`${this.base(organizationId)}/books`, {
        params: new HttpParams().set('translationId', translationId),
      })
      .pipe(map((value) => z.string().array().parse(value)));
  }

  listChapters(
    organizationId: string,
    translationId: string,
    book: string,
  ): Observable<number[]> {
    return this.http
      .get<unknown>(`${this.base(organizationId)}/chapters`, {
        params: new HttpParams()
          .set('translationId', translationId)
          .set('book', book),
      })
      .pipe(map((value) => z.number().int().array().parse(value)));
  }

  listVerses(
    organizationId: string,
    translationId: string,
    book: string,
    chapter: number,
  ): Observable<number[]> {
    return this.http
      .get<unknown>(`${this.base(organizationId)}/verses`, {
        params: new HttpParams()
          .set('translationId', translationId)
          .set('book', book)
          .set('chapter', chapter),
      })
      .pipe(map((value) => z.number().int().array().parse(value)));
  }

  createPassage(
    organizationId: string,
    input: CreateBiblePassageRequestDto,
  ): Observable<BiblePassageDto> {
    return this.http
      .post<unknown>(`${this.base(organizationId)}/passages`, input)
      .pipe(map((value) => BiblePassageSchema.parse(value)));
  }

  listPassages(organizationId: string): Observable<BiblePassageDto[]> {
    return this.http
      .get<unknown>(`${this.base(organizationId)}/passages`)
      .pipe(map((value) => BiblePassageSchema.array().parse(value)));
  }

  getPassage(
    organizationId: string,
    passageId: string,
  ): Observable<BiblePassageDto> {
    return this.http
      .get<unknown>(`${this.base(organizationId)}/passages/${passageId}`)
      .pipe(map((value) => BiblePassageSchema.parse(value)));
  }

  listPassageTranslations(
    organizationId: string,
    passageId: string,
  ): Observable<BiblePassageTranslationDto[]> {
    return this.http
      .get<unknown>(
        `${this.base(organizationId)}/passages/${passageId}/translations`,
      )
      .pipe(map((value) => BiblePassageTranslationSchema.array().parse(value)));
  }

  generatePassageTranslation(
    organizationId: string,
    passageId: string,
    input: GenerateBiblePassageTranslationRequestDto,
  ): Observable<BiblePassageTranslationDto> {
    return this.http
      .post<unknown>(
        `${this.base(organizationId)}/passages/${passageId}/translations/generate`,
        input,
      )
      .pipe(map((value) => BiblePassageTranslationSchema.parse(value)));
  }

  private base(organizationId: string): string {
    return `/api/v1/organizations/${organizationId}/bible`;
  }
}
