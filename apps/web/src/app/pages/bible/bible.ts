import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  ImportBibleRequestSchema,
  parseXmlBible,
  type BiblePassageDto,
  type BibleTranslationDto,
  type ImportSourceDto,
} from '@worship/shared-dto';
import { AuthSessionStore } from '../../core/auth-session.store';
import { BibleApiService } from '../../core/bible-api.service';
import { CustomSelectComponent } from '../../shared/custom-select/custom-select';

@Component({
  selector: 'app-bible-page',
  imports: [ReactiveFormsModule, CustomSelectComponent],
  templateUrl: './bible.html',
  styleUrl: './bible.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BiblePage {
  protected translationOptions() {
    return this.translations().map((translation) => ({
      value: translation.id,
      label: `${translation.name} · ${translation.abbreviation}`,
    }));
  }
  protected bookOptions() {
    return this.books().map((book) => ({ value: book, label: book }));
  }
  protected chapterOptions() {
    return this.chapters().map((chapter) => ({
      value: String(chapter),
      label: String(chapter),
    }));
  }
  protected verseOptions() {
    return this.verses().map((verse) => ({
      value: String(verse),
      label: String(verse),
    }));
  }
  readonly translations = signal<readonly BibleTranslationDto[]>([]);
  readonly passage = signal<BiblePassageDto | null>(null);
  readonly books = signal<readonly string[]>([]);
  readonly chapters = signal<readonly number[]>([]);
  readonly verses = signal<readonly number[]>([]);
  readonly searching = signal(false);
  readonly importing = signal(false);
  readonly importSources = signal<readonly ImportSourceDto[]>([]);
  readonly importMessage = signal<string | null>(null);
  readonly importError = signal<string | null>(null);
  readonly searchForm = inject(FormBuilder).nonNullable.group({
    translationId: ['', Validators.required],
    query: [''],
    book: [''],
    chapter: [''],
    verseStart: [''],
    verseEnd: [''],
  });
  readonly importForm = inject(FormBuilder).nonNullable.group({
    sourceId: ['getbible-v2'],
    resource: [''],
    url: [''],
  });
  private readonly organizationId =
    inject(AuthSessionStore).session()?.memberships[0]?.organizationId;

  constructor(private readonly bible: BibleApiService) {
    this.loadTranslations();
    this.loadImportSources();
  }

  search(): void {
    if (
      !this.organizationId ||
      !this.searchForm.controls.translationId.value ||
      !this.reference()
    )
      return;
    this.searching.set(true);
    this.passage.set(null);
    const value = this.searchForm.getRawValue();
    this.bible
      .search(this.organizationId, {
        translationId: value.translationId,
        query: this.reference(),
      })
      .subscribe({
        next: (passage) => {
          this.passage.set(passage);
          this.searching.set(false);
        },
        error: () => this.searching.set(false),
      });
  }

  importRemote(): void {
    if (!this.organizationId || this.importing()) return;
    const value = this.importForm.getRawValue();
    const input = value.sourceId
      ? {
          sourceId: value.sourceId,
          ...(value.resource.trim() ? { resource: value.resource.trim() } : {}),
        }
      : { url: value.url.trim() };
    if (
      (!value.sourceId && !value.url.trim()) ||
      (value.sourceId &&
        this.selectedImportSource()?.requiresResource &&
        !value.resource.trim())
    ) {
      this.importError.set(
        'Select a source and enter its resource, or provide a public HTTPS JSON URL.',
      );
      return;
    }
    this.importing.set(true);
    this.importMessage.set(null);
    this.importError.set(null);
    this.bible.importBible(this.organizationId, input).subscribe({
      next: (result) => {
        this.importMessage.set(
          `${result.translation.name}: ${result.importedVerses} verses imported.`,
        );
        this.importing.set(false);
        this.loadTranslations(result.translation.id);
      },
      error: (error: unknown) => {
        this.importError.set(
          this.errorMessage(error, 'The Bible could not be imported.'),
        );
        this.importing.set(false);
      },
    });
  }

  async importFile(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!this.organizationId || !file || this.importing()) return;
    this.importing.set(true);
    this.importMessage.set(null);
    this.importError.set(null);
    try {
      const content = await file.text();
      const payload =
        file.name.toLowerCase().endsWith('.xml') || /<XMLBIBLE\b/i.test(content)
          ? parseXmlBible(content, file.name)
          : ImportBibleRequestSchema.parse(JSON.parse(content));
      this.bible.importBible(this.organizationId, payload).subscribe({
        next: (result) => {
          this.importMessage.set(
            `${result.translation.name}: ${result.importedVerses} verses imported.`,
          );
          this.importing.set(false);
          this.loadTranslations(result.translation.id);
        },
        error: (error: unknown) => {
          this.importError.set(
            this.errorMessage(error, 'The Bible JSON could not be imported.'),
          );
          this.importing.set(false);
        },
      });
    } catch {
      this.importError.set(
        'Choose a canonical JSON Bible or a Zefania XMLBIBLE file.',
      );
      this.importing.set(false);
    }
  }

  chooseImportSource(sourceId: string): void {
    this.importForm.patchValue({ sourceId, url: '' });
  }

  usePublicUrl(): void {
    this.importForm.patchValue({ sourceId: '', resource: '' });
  }

  selectedImportSource(): ImportSourceDto | undefined {
    return this.importSources().find(
      (source) => source.id === this.importForm.controls.sourceId.value,
    );
  }

  protected importSourceOptions() {
    return [
      ...this.importSources().map((source) => ({
        value: source.id,
        label: source.name,
      })),
      { value: '', label: 'Public HTTPS JSON URL' },
    ];
  }

  chooseTranslation(translationId: string): void {
    this.searchForm.patchValue({
      translationId,
      query: '',
      book: '',
      chapter: '',
      verseStart: '',
      verseEnd: '',
    });
    this.books.set([]);
    this.chapters.set([]);
    this.verses.set([]);
    if (!this.organizationId || !translationId) return;
    this.bible
      .listBooks(this.organizationId, translationId)
      .subscribe({ next: (books) => this.books.set(books) });
  }

  chooseBook(book: string): void {
    const translationId = this.searchForm.controls.translationId.value;
    this.searchForm.patchValue({
      query: '',
      book,
      chapter: '',
      verseStart: '',
      verseEnd: '',
    });
    this.chapters.set([]);
    this.verses.set([]);
    if (!this.organizationId || !translationId || !book) return;
    this.bible
      .listChapters(this.organizationId, translationId, book)
      .subscribe({ next: (chapters) => this.chapters.set(chapters) });
  }

  chooseChapter(chapter: string): void {
    const translationId = this.searchForm.controls.translationId.value;
    const book = this.searchForm.controls.book.value;
    this.searchForm.patchValue({
      query: '',
      chapter,
      verseStart: '',
      verseEnd: '',
    });
    this.verses.set([]);
    if (!this.organizationId || !translationId || !book || !chapter) return;
    this.bible
      .listVerses(this.organizationId, translationId, book, Number(chapter))
      .subscribe({ next: (verses) => this.verses.set(verses) });
  }

  reference(): string {
    const { query, book, chapter, verseStart, verseEnd } =
      this.searchForm.getRawValue();
    if (query.trim()) return query.trim();
    if (!book || !chapter) return '';
    if (!verseStart) return `${book} ${chapter}`;
    return `${book} ${chapter}:${verseStart}${verseEnd && verseEnd !== verseStart ? `-${verseEnd}` : ''}`;
  }

  private loadTranslations(selectedId?: string): void {
    if (!this.organizationId) return;
    this.bible.listTranslations(this.organizationId).subscribe({
      next: (translations) => {
        this.translations.set(translations);
        const selected =
          translations.find((translation) => translation.id === selectedId) ??
          translations[0];
        if (selected) this.chooseTranslation(selected.id);
      },
    });
  }

  private loadImportSources(): void {
    if (!this.organizationId) return;
    this.bible
      .listImportSources(this.organizationId)
      .subscribe({ next: (sources) => this.importSources.set(sources) });
  }

  private errorMessage(error: unknown, fallback: string): string {
    if (
      typeof error === 'object' &&
      error !== null &&
      'error' in error &&
      typeof error.error === 'object' &&
      error.error !== null &&
      'message' in error.error &&
      typeof error.error.message === 'string'
    )
      return error.error.message;
    return fallback;
  }
}
