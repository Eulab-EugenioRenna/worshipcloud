import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { CountdownDefinitionDto, CountdownMode, MediaAssetDto, MediaAssetKind, SlideDocumentDto } from '@worship/shared-dto';
import { AuthSessionStore } from '../../core/auth-session.store';
import { CountdownsApiService } from '../../core/countdowns-api.service';
import { MediaApiService } from '../../core/media-api.service';
import { SlidesApiService } from '../../core/slides-api.service';

type LibrarySection = 'media' | 'slides' | 'countdowns';

@Component({
  selector: 'app-library-page',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './library.html',
  styleUrl: './library.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LibraryPage {
  readonly activeSection = signal<LibrarySection>('media');
  readonly media = signal<readonly MediaAssetDto[]>([]);
  readonly slides = signal<readonly SlideDocumentDto[]>([]);
  readonly countdowns = signal<readonly CountdownDefinitionDto[]>([]);
  readonly saving = signal(false);
  readonly mediaForm = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(1)]],
    kind: ['Image' as MediaAssetKind, Validators.required],
    url: ['', [Validators.required, Validators.pattern(/^https?:\/\/.+/)]],
  });
  readonly slideForm = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(1)]],
    text: ['', [Validators.required, Validators.minLength(1)]],
  });
  readonly countdownForm = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(1)]],
    mode: ['Duration' as CountdownMode, Validators.required],
    minutes: [10, [Validators.required, Validators.min(1), Validators.max(1440)]],
    targetAt: [''],
    autoAdvance: [false],
  });
  private readonly organizationId = inject(AuthSessionStore).session()?.memberships[0]?.organizationId;

  constructor(
    private readonly mediaApi: MediaApiService,
    private readonly slidesApi: SlidesApiService,
    private readonly countdownsApi: CountdownsApiService,
  ) { this.load(); }

  open(section: LibrarySection): void { this.activeSection.set(section); }

  createMedia(): void {
    if (!this.organizationId || this.mediaForm.invalid) return;
    this.saving.set(true);
    this.mediaApi.create(this.organizationId, { ...this.mediaForm.getRawValue(), tags: [] }).subscribe({
      next: (asset) => { this.media.update((items) => [asset, ...items]); this.mediaForm.reset({ name: '', kind: 'Image', url: '' }); this.saving.set(false); },
      error: () => this.saving.set(false),
    });
  }

  createSlide(): void {
    if (!this.organizationId || this.slideForm.invalid) return;
    this.saving.set(true);
    const value = this.slideForm.getRawValue();
    const textId = `text-${Date.now()}`;
    this.slidesApi.create(this.organizationId, {
      name: value.name,
      content: {
        blocks: [{ id: textId, type: 'Text', data: { text: value.text } }],
        layout: {
          version: 1,
          size: { width: 1920, height: 1080, orientation: 'H' },
          background: { color: '#090b0f' },
          elements: [{ id: textId, type: 'Text', x: 10, y: 36, width: 80, height: 28, zIndex: 1, style: { color: '#ffffff', fontSize: 7, fontFamily: 'Georgia', textAlign: 'center' }, data: { text: value.text } }],
        },
      },
    }).subscribe({
      next: (slide) => { this.slides.update((items) => [slide, ...items]); this.slideForm.reset({ name: '', text: '' }); this.saving.set(false); },
      error: () => this.saving.set(false),
    });
  }

  createCountdown(): void {
    if (!this.organizationId || this.countdownForm.invalid) return;
    const value = this.countdownForm.getRawValue();
    const targetAt = value.targetAt ? new Date(value.targetAt) : null;
    if (value.mode === 'TargetTime' && (!targetAt || Number.isNaN(targetAt.getTime()))) return;
    this.saving.set(true);
    this.countdownsApi.create(this.organizationId, {
      name: value.name,
      mode: value.mode,
      ...(value.mode === 'Duration' ? { durationSeconds: value.minutes * 60 } : { targetAt: targetAt!.toISOString() }),
      autoAdvance: value.autoAdvance,
    }).subscribe({
      next: (countdown) => { this.countdowns.update((items) => [countdown, ...items]); this.countdownForm.reset({ name: '', mode: 'Duration', minutes: 10, targetAt: '', autoAdvance: false }); this.saving.set(false); },
      error: () => this.saving.set(false),
    });
  }

  countdownMode(): CountdownMode { return this.countdownForm.controls.mode.value; }

  private load(): void {
    if (!this.organizationId) return;
    this.mediaApi.list(this.organizationId).subscribe({ next: (media) => this.media.set(media) });
    this.slidesApi.list(this.organizationId).subscribe({ next: (slides) => this.slides.set(slides) });
    this.countdownsApi.list(this.organizationId).subscribe({ next: (countdowns) => this.countdowns.set(countdowns) });
  }
}
