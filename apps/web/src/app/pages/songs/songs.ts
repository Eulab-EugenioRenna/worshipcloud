import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  ImportSongsRequestSchema,
  type ImportSourceDto,
  type SongDto,
} from '@worship/shared-dto';
import { AuthSessionStore } from '../../core/auth-session.store';
import { SongsApiService } from '../../core/songs-api.service';
import {
  CustomSelectComponent,
  type CustomSelectOption,
} from '../../shared/custom-select/custom-select';

@Component({
  selector: 'app-songs-page',
  imports: [ReactiveFormsModule, RouterLink, CustomSelectComponent],
  templateUrl: './songs.html',
  styleUrl: './songs.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SongsPage {
  readonly songs = signal<readonly SongDto[]>([]);
  readonly query = signal('');
  readonly creating = signal(false);
  readonly importing = signal(false);
  readonly showCreate = signal(false);
  readonly showImport = signal(false);
  readonly importSources = signal<readonly ImportSourceDto[]>([]);
  readonly createError = signal<string | null>(null);
  readonly languageOptions: readonly CustomSelectOption[] = [
    { value: 'it', label: 'Italiano' },
    { value: 'en', label: 'English' },
    { value: 'es', label: 'Español' },
    { value: 'fr', label: 'Français' },
    { value: 'de', label: 'Deutsch' },
    { value: 'pt', label: 'Português' },
  ];
  private readonly organizationId =
    inject(AuthSessionStore).session()?.memberships[0]?.organizationId;
  readonly form = inject(FormBuilder).nonNullable.group({
    title: ['', [Validators.required, Validators.minLength(1)]],
    locale: ['it', [Validators.required]],
    author: [''],
    key: [''],
    bpm: [null as number | null],
  });
  readonly importForm = inject(FormBuilder).nonNullable.group({
    sourceId: [''],
    resource: [''],
    url: [''],
  });

  constructor(private readonly songsApi: SongsApiService) {
    this.load();
    this.loadImportSources();
  }

  load(search = this.query()): void {
    if (!this.organizationId) return;
    this.songsApi
      .list(this.organizationId, search ? { search } : {})
      .subscribe({ next: (songs) => this.songs.set(songs) });
  }

  search(value: string): void {
    this.query.set(value);
    this.load(value);
  }

  create(): void {
    if (!this.organizationId || this.form.invalid) {
      this.form.markAllAsTouched();
      this.createError.set(
        'Enter a song title before adding it to the library.',
      );
      return;
    }
    this.creating.set(true);
    this.createError.set(null);
    const value = this.form.getRawValue();
    this.songsApi
      .create(this.organizationId, {
        title: value.title,
        locale: value.locale.trim().toLowerCase(),
        ...(value.author ? { author: value.author } : {}),
        ...(value.key ? { key: value.key } : {}),
        ...(value.bpm !== null && value.bpm > 0 ? { bpm: value.bpm } : {}),
        sections: [],
      })
      .subscribe({
        next: (song) => {
          this.songs.update((current) => [...current, song]);
          this.form.reset({
            title: '',
            locale: 'it',
            author: '',
            key: '',
            bpm: null,
          });
          this.creating.set(false);
          this.showCreate.set(false);
        },
        error: (error: unknown) => {
          this.createError.set(this.errorMessage(error));
          this.creating.set(false);
        },
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
      this.createError.set(
        'Select a configured source or provide a public HTTPS JSON URL.',
      );
      return;
    }
    this.importing.set(true);
    this.createError.set(null);
    this.songsApi.importSongs(this.organizationId, input).subscribe({
      next: () => {
        this.importing.set(false);
        this.showImport.set(false);
        this.load();
      },
      error: (error: unknown) => {
        this.createError.set(this.errorMessage(error));
        this.importing.set(false);
      },
    });
  }

  async importFile(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!this.organizationId || !file || this.importing()) return;
    this.importing.set(true);
    this.createError.set(null);
    try {
      const payload = ImportSongsRequestSchema.parse(
        JSON.parse(await file.text()),
      );
      this.songsApi.importSongs(this.organizationId, payload).subscribe({
        next: () => {
          this.importing.set(false);
          this.load();
        },
        error: (error: unknown) => {
          this.createError.set(this.errorMessage(error));
          this.importing.set(false);
        },
      });
    } catch {
      this.createError.set('Choose a JSON file with a songs array.');
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

  importSourceOptions(): readonly CustomSelectOption[] {
    return [
      ...this.importSources().map((source) => ({
        value: source.id,
        label: source.name,
      })),
      { value: '', label: 'Public HTTPS JSON URL' },
    ];
  }

  private loadImportSources(): void {
    if (!this.organizationId) return;
    this.songsApi
      .listImportSources(this.organizationId)
      .subscribe({ next: (sources) => this.importSources.set(sources) });
  }

  private errorMessage(error: unknown): string {
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
    return 'The song could not be created. Please try again.';
  }
}
