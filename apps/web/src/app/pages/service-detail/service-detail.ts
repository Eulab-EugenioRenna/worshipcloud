import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnDestroy,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import {
  adaptDefaultCanvasLayout,
  CanvasLayoutSchema,
  templateKindsForLineupItem,
  type BiblePassageDto,
  type BibleTranslationDto,
  type CanvasLayoutDto,
  type CountdownDefinitionDto,
  type CreateBiblePassageRequestDto,
  type CreateLineupItemRequestDto,
  type LineupItemDto,
  type LineupItemType,
  type LineupVisualSlideDto,
  type MediaAssetDto,
  type OrganizationMemberDto,
  type OutputTarget,
  type ServiceDto,
  type ServiceTeamAssignmentDto,
  type SlideDocumentDto,
  type SlideTemplateDto,
  type SongDto,
} from '@worship/shared-dto';
import { AuthSessionStore } from '../../core/auth-session.store';
import { BibleApiService } from '../../core/bible-api.service';
import { CountdownsApiService } from '../../core/countdowns-api.service';
import { EventBusService } from '../../core/event-bus.service';
import { MediaApiService } from '../../core/media-api.service';
import { OrganizationsApiService } from '../../core/organizations-api.service';
import { ServicesApiService } from '../../core/services-api.service';
import { SlidesApiService } from '../../core/slides-api.service';
import { SongsApiService } from '../../core/songs-api.service';
import { TeamApiService } from '../../core/team-api.service';
import { ConfirmationDialogComponent } from '../../shared/confirmation-dialog/confirmation-dialog';
import { CanvasEditorComponent } from '../../shared/canvas-editor/canvas-editor';
import {
  CustomSelectComponent,
  type CustomSelectOption,
} from '../../shared/custom-select/custom-select';

@Component({
  selector: 'app-service-detail-page',
  imports: [
    DecimalPipe,
    ReactiveFormsModule,
    RouterLink,
    ConfirmationDialogComponent,
    CanvasEditorComponent,
    CustomSelectComponent,
  ],
  templateUrl: './service-detail.html',
  styleUrl: './service-detail.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ServiceDetailPage implements OnDestroy {
  readonly service = signal<ServiceDto | null>(null);
  readonly error = signal<string | null>(null);
  readonly assignments = signal<readonly ServiceTeamAssignmentDto[]>([]);
  readonly members = signal<readonly OrganizationMemberDto[]>([]);
  readonly cueType = signal<LineupItemType>('Text');
  readonly songs = signal<readonly SongDto[]>([]);
  readonly bibleTranslations = signal<readonly BibleTranslationDto[]>([]);
  readonly bibleBooks = signal<readonly string[]>([]);
  readonly bibleChapters = signal<readonly number[]>([]);
  readonly bibleVerses = signal<readonly number[]>([]);
  readonly biblePreview = signal<BiblePassageDto | null>(null);
  readonly loadingBiblePreview = signal(false);
  readonly media = signal<readonly MediaAssetDto[]>([]);
  readonly slides = signal<readonly SlideDocumentDto[]>([]);
  readonly countdowns = signal<readonly CountdownDefinitionDto[]>([]);
  readonly confirmation = signal<{
    kind: 'cue' | 'assignment' | 'view';
    id: string;
    label: string;
  } | null>(null);
  readonly editingCue = signal<LineupItemDto | null>(null);
  readonly activeCue = signal<LineupItemDto | null>(null);
  readonly visualScenes = signal<readonly LineupVisualSlideDto[]>([]);
  readonly activeVisualSceneId = signal<string | null>(null);
  readonly visualSceneName = signal('');
  readonly visualTarget = signal<OutputTarget>('Main');
  readonly visualLayout = signal<CanvasLayoutDto>(this.defaultCanvas());
  readonly viewTemplates = signal<readonly SlideTemplateDto[]>([]);
  readonly activeVisualTemplateId = signal<string | null>(null);
  readonly savingVisualScene = signal(false);
  readonly savingCue = signal(false);
  readonly duplicatingCueId = signal<string | null>(null);
  readonly savingAssignment = signal(false);
  readonly removingAssignmentId = signal<string | null>(null);
  private serviceEvents?: Subscription;
  private readonly organizationId =
    inject(AuthSessionStore).session()?.memberships[0]?.organizationId;
  private readonly serviceId =
    inject(ActivatedRoute).snapshot.paramMap.get('serviceId');
  readonly cueForm = inject(FormBuilder).nonNullable.group({
    type: ['Text' as LineupItemType, Validators.required],
    title: ['', [Validators.required, Validators.minLength(1)]],
    sourceId: [''],
    contentLocale: [''],
    notes: [''],
  });
  readonly bibleSelection = inject(FormBuilder).nonNullable.group({
    translationId: ['', Validators.required],
    reference: [''],
    book: [''],
    chapter: [''],
    verseStart: [''],
    verseEnd: [''],
  });
  readonly teamForm = inject(FormBuilder).nonNullable.group({
    userId: ['', Validators.required],
    role: ['', [Validators.required, Validators.minLength(2)]],
  });

  constructor(
    private readonly services: ServicesApiService,
    private readonly team: TeamApiService,
    private readonly organizations: OrganizationsApiService,
    private readonly songsApi: SongsApiService,
    private readonly bibleApi: BibleApiService,
    private readonly mediaApi: MediaApiService,
    private readonly slidesApi: SlidesApiService,
    private readonly countdownsApi: CountdownsApiService,
    private readonly events: EventBusService,
  ) {
    if (this.organizationId && this.serviceId) {
      this.reload();
      this.loadMembers();
      this.loadCueSources();
      this.serviceEvents = this.events.events$.subscribe((event) => {
        const belongsToService =
          event.payload.serviceId === this.serviceId ||
          event.subjectId === this.serviceId;
        if (belongsToService && event.type.startsWith('service.'))
          this.reload();
        if (
          event.organizationId === this.organizationId &&
          event.type.startsWith('slide.template.')
        ) {
          this.slidesApi.listTemplates(this.organizationId!).subscribe({
            next: (templates) => this.viewTemplates.set(templates),
          });
          this.refreshActiveVisualScenes();
        }
      });
    }
  }

  addCue(): void {
    if (
      !this.organizationId ||
      !this.serviceId ||
      this.cueForm.invalid ||
      this.savingCue() ||
      (this.cueType() === 'Bible' &&
        !this.editingCue() &&
        !this.hasBibleSelection())
    )
      return;
    const value = this.cueForm.getRawValue();
    const editing = this.editingCue();
    this.savingCue.set(true);
    if (editing) {
      this.services
        .updateLineupItem(this.organizationId, this.serviceId, editing.id, {
          type: value.type,
          title: value.title,
          sourceId: value.sourceId || null,
          contentLocale: value.contentLocale || null,
          notes: value.notes || null,
        })
        .subscribe({
          next: () => {
            this.resetCueForm();
            this.reload();
            this.savingCue.set(false);
          },
          error: () => {
            this.error.set('The cue could not be saved.');
            this.savingCue.set(false);
          },
        });
      return;
    }
    if (value.type === 'Bible') {
      const organizationId = this.organizationId;
      const selection = this.bibleSelection.getRawValue();
      const createPassage = (input: CreateBiblePassageRequestDto) =>
        this.bibleApi.createPassage(organizationId, input).subscribe({
          next: (passage) =>
            this.createLineupCue({
              type: 'Bible',
              title: passage.reference,
              sourceId: passage.id,
              ...(value.contentLocale
                ? { contentLocale: value.contentLocale }
                : {}),
              ...(value.notes ? { notes: value.notes } : {}),
            }),
          error: () => {
            this.error.set('The Bible passage could not be prepared.');
            this.savingCue.set(false);
          },
        });
      if (selection.reference.trim()) {
        this.bibleApi
          .search(this.organizationId, {
            translationId: selection.translationId,
            query: selection.reference.trim(),
          })
          .subscribe({
            next: (passage) => createPassage(this.passageRequest(passage)),
            error: () => {
              this.error.set('The Bible reference is unavailable.');
              this.savingCue.set(false);
            },
          });
        return;
      }
      createPassage({
        translationId: selection.translationId,
        book: selection.book,
        chapter: Number(selection.chapter),
        ...(selection.verseStart
          ? {
              verseStart: Number(selection.verseStart),
              verseEnd: Number(selection.verseEnd || selection.verseStart),
            }
          : {}),
      });
      return;
    }
    this.createLineupCue({
      type: value.type,
      title: value.title,
      ...(value.sourceId ? { sourceId: value.sourceId } : {}),
      ...(value.contentLocale ? { contentLocale: value.contentLocale } : {}),
      ...(value.notes ? { notes: value.notes } : {}),
    });
  }

  beginEditCue(cue: LineupItemDto): void {
    this.editingCue.set(cue);
    this.cueType.set(cue.type);
    this.cueForm.patchValue({
      type: cue.type,
      title: cue.title,
      sourceId: cue.sourceId ?? '',
      contentLocale: cue.contentLocale ?? '',
      notes: cue.notes ?? '',
    });
  }

  cancelCueEdit(): void {
    if (!this.savingCue()) this.resetCueForm();
  }

  duplicateCue(cue: LineupItemDto): void {
    if (!this.organizationId || !this.serviceId || this.duplicatingCueId())
      return;
    this.duplicatingCueId.set(cue.id);
    this.services
      .duplicateLineupItem(this.organizationId, this.serviceId, cue.id)
      .subscribe({
        next: () => {
          this.duplicatingCueId.set(null);
          this.reload();
        },
        error: () => {
          this.error.set('The cue could not be duplicated.');
          this.duplicatingCueId.set(null);
        },
      });
  }

  chooseCueType(value: string): void {
    const type = value as LineupItemType;
    this.cueType.set(type);
    this.cueForm.patchValue({ type, sourceId: '', contentLocale: '' });
    this.bibleSelection.reset({
      translationId: '',
      reference: '',
      book: '',
      chapter: '',
      verseStart: '',
      verseEnd: '',
    });
    this.bibleBooks.set([]);
    this.bibleChapters.set([]);
    this.bibleVerses.set([]);
    this.biblePreview.set(null);
  }

  private resetCueForm(): void {
    this.editingCue.set(null);
    this.cueType.set('Text');
    this.cueForm.reset({
      type: 'Text',
      title: '',
      sourceId: '',
      contentLocale: '',
      notes: '',
    });
    this.bibleSelection.reset({
      translationId: '',
      reference: '',
      book: '',
      chapter: '',
      verseStart: '',
      verseEnd: '',
    });
    this.bibleBooks.set([]);
    this.bibleChapters.set([]);
    this.bibleVerses.set([]);
    this.biblePreview.set(null);
  }

  chooseBibleTranslation(translationId: string): void {
    this.bibleSelection.patchValue({
      translationId,
      reference: '',
      book: '',
      chapter: '',
      verseStart: '',
      verseEnd: '',
    });
    this.bibleBooks.set([]);
    this.bibleChapters.set([]);
    this.bibleVerses.set([]);
    this.biblePreview.set(null);
    const translation = this.bibleTranslations().find(
      (item) => item.id === translationId,
    );
    this.cueForm.patchValue({ contentLocale: translation?.locale ?? '' });
    if (!this.organizationId || !translationId) return;
    this.bibleApi.listBooks(this.organizationId, translationId).subscribe({
      next: (books) => this.bibleBooks.set(books),
      error: () => this.error.set('Bible books could not be loaded.'),
    });
  }

  chooseBibleBook(book: string): void {
    const translationId = this.bibleSelection.controls.translationId.value;
    this.bibleSelection.patchValue({
      reference: '',
      book,
      chapter: '',
      verseStart: '',
      verseEnd: '',
    });
    this.bibleChapters.set([]);
    this.bibleVerses.set([]);
    this.biblePreview.set(null);
    if (!this.organizationId || !translationId || !book) return;
    this.bibleApi
      .listChapters(this.organizationId, translationId, book)
      .subscribe({
        next: (chapters) => this.bibleChapters.set(chapters),
        error: () => this.error.set('Bible chapters could not be loaded.'),
      });
  }

  chooseBibleChapter(chapter: string): void {
    this.bibleSelection.patchValue({
      reference: '',
      chapter,
      verseStart: '',
      verseEnd: '',
    });
    const book = this.bibleSelection.controls.book.value;
    this.cueForm.patchValue({
      title: book && chapter ? `${book} ${chapter}` : '',
    });
    this.bibleVerses.set([]);
    this.biblePreview.set(null);
    const translationId = this.bibleSelection.controls.translationId.value;
    if (!this.organizationId || !translationId || !book || !chapter) return;
    this.bibleApi
      .listVerses(this.organizationId, translationId, book, Number(chapter))
      .subscribe({
        next: (verses) => {
          this.bibleVerses.set(verses);
          this.loadBiblePreview();
        },
        error: () => this.error.set('Bible verses could not be loaded.'),
      });
  }

  setBibleReference(reference: string): void {
    this.bibleSelection.patchValue({
      reference,
      book: '',
      chapter: '',
      verseStart: '',
      verseEnd: '',
    });
    this.bibleChapters.set([]);
    this.bibleVerses.set([]);
    this.biblePreview.set(null);
    this.cueForm.patchValue({ title: reference.trim() });
  }

  chooseBibleVerseStart(verseStart: string): void {
    this.bibleSelection.patchValue({
      reference: '',
      verseStart,
      verseEnd: verseStart,
    });
    this.loadBiblePreview();
  }

  chooseBibleVerseEnd(verseEnd: string): void {
    const verseStart = this.bibleSelection.controls.verseStart.value;
    if (verseStart && verseEnd && Number(verseEnd) < Number(verseStart)) {
      this.bibleSelection.patchValue({ verseEnd: verseStart });
    } else {
      this.bibleSelection.patchValue({ verseEnd });
    }
    this.loadBiblePreview();
  }

  bibleVerseOptions(): readonly CustomSelectOption[] {
    return this.bibleVerses().map((verse) => ({
      value: String(verse),
      label: String(verse),
    }));
  }

  hasBibleSelection(): boolean {
    const value = this.bibleSelection.getRawValue();
    return !!(
      value.translationId &&
      (value.reference.trim() || (value.book && value.chapter))
    );
  }

  loadBiblePreview(): void {
    const value = this.bibleSelection.getRawValue();
    const reference = value.reference.trim() || this.selectorBibleReference();
    if (!this.organizationId || !value.translationId || !reference) return;
    this.loadingBiblePreview.set(true);
    this.error.set(null);
    this.bibleApi
      .search(this.organizationId, {
        translationId: value.translationId,
        query: reference,
      })
      .subscribe({
        next: (passage) => {
          this.biblePreview.set(passage);
          this.cueForm.patchValue({ title: passage.reference });
          this.loadingBiblePreview.set(false);
        },
        error: () => {
          this.biblePreview.set(null);
          this.error.set('The Bible reference is unavailable.');
          this.loadingBiblePreview.set(false);
        },
      });
  }

  private selectorBibleReference(): string {
    const { book, chapter, verseStart, verseEnd } =
      this.bibleSelection.getRawValue();
    if (!book || !chapter) return '';
    if (!verseStart) return `${book} ${chapter}`;
    return `${book} ${chapter}:${verseStart}${verseEnd && verseEnd !== verseStart ? `-${verseEnd}` : ''}`;
  }

  private passageRequest(
    passage: BiblePassageDto,
  ): CreateBiblePassageRequestDto {
    return {
      translationId: passage.translationId,
      book: passage.book,
      chapter: passage.chapter,
      verseStart: passage.verseStart,
      verseEnd: passage.verseEnd,
    };
  }

  bibleTranslationOptions(): readonly CustomSelectOption[] {
    return this.bibleTranslations().map((translation) => ({
      value: translation.id,
      label: `${translation.name} · ${translation.abbreviation}`,
    }));
  }

  bibleBookOptions(): readonly CustomSelectOption[] {
    return this.bibleBooks().map((book) => ({ value: book, label: book }));
  }

  bibleChapterOptions(): readonly CustomSelectOption[] {
    return this.bibleChapters().map((chapter) => ({
      value: String(chapter),
      label: String(chapter),
    }));
  }

  selectSource(sourceId: string): void {
    const source = this.sourceOptions().find(
      (option) => option.id === sourceId,
    );
    if (source) this.cueForm.patchValue({ sourceId, title: source.title });
  }

  sourceOptions(): readonly { id: string; title: string }[] {
    switch (this.cueType()) {
      case 'Song':
        return this.songs().map(({ id, title }) => ({ id, title }));
      case 'Bible':
        return [];
      case 'Slide':
        return this.slides().map(({ id, name }) => ({ id, title: name }));
      case 'Countdown':
        return this.countdowns().map(({ id, name }) => ({ id, title: name }));
      case 'Image':
        return this.media()
          .filter((asset) => asset.kind === 'Image' || asset.kind === 'Logo')
          .map(({ id, name }) => ({ id, title: name }));
      case 'Video':
        return this.media()
          .filter(
            (asset) =>
              asset.kind === 'Video' ||
              asset.kind === 'MotionBackground' ||
              asset.kind === 'CountdownVideo',
          )
          .map(({ id, name }) => ({ id, title: name }));
      case 'Audio':
        return this.media()
          .filter((asset) => asset.kind === 'Audio')
          .map(({ id, name }) => ({ id, title: name }));
      default:
        return [];
    }
  }

  cueTypeOptions(): readonly CustomSelectOption[] {
    return [
      'Song',
      'Bible',
      'Slide',
      'Image',
      'Video',
      'Audio',
      'Countdown',
      'Text',
      'Blank',
      'Sermon',
      'Clock',
    ].map((type) => ({ value: type, label: type }));
  }

  sourceSelectOptions(): readonly CustomSelectOption[] {
    return this.sourceOptions().map((source) => ({
      value: source.id,
      label: source.title,
    }));
  }

  hasSource(): boolean {
    return [
      'Song',
      'Bible',
      'Slide',
      'Image',
      'Video',
      'Audio',
      'Countdown',
    ].includes(this.cueType());
  }

  supportsContentLocale(): boolean {
    return this.cueType() === 'Song' || this.cueType() === 'Bible';
  }

  songLocalesForSelectedSource(): readonly string[] {
    const sourceId = this.cueForm.controls.sourceId.value;
    const song = this.songs().find((item) => item.id === sourceId);
    return song
      ? [
          song.locale,
          ...song.translations.map((translation) => translation.locale),
        ]
      : [];
  }

  songLocaleOptions(): readonly CustomSelectOption[] {
    return this.songLocalesForSelectedSource().map((locale) => ({
      value: locale,
      label: locale,
    }));
  }

  memberOptions(): readonly CustomSelectOption[] {
    return this.members().map((member) => ({
      value: member.user.id,
      label: member.user.name,
    }));
  }

  askRemoveCue(itemId: string, title: string): void {
    this.confirmation.set({ kind: 'cue', id: itemId, label: title });
  }

  removeCue(itemId: string): void {
    if (!this.organizationId || !this.serviceId) return;
    this.services
      .removeLineupItem(this.organizationId, this.serviceId, itemId)
      .subscribe({ next: () => this.reload() });
  }

  moveCue(item: LineupItemDto, direction: -1 | 1): void {
    if (!this.organizationId || !this.serviceId) return;
    const current = this.service();
    if (!current) return;
    const lineup = [...current.lineup];
    const from = lineup.findIndex((cue) => cue.id === item.id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= lineup.length) return;
    [lineup[from], lineup[to]] = [lineup[to], lineup[from]];
    this.services
      .reorderLineup(this.organizationId, this.serviceId, {
        itemIds: lineup.map((cue) => cue.id),
      })
      .subscribe({
        next: () => this.reload(),
        error: () => this.error.set('The cue order could not be saved.'),
      });
  }

  editCueScene(cue: LineupItemDto): void {
    if (!this.organizationId || !this.serviceId) return;
    this.activeCue.set(cue);
    this.activeVisualSceneId.set(null);
    this.visualSceneName.set(`${cue.title} visual`);
    this.visualTarget.set('Main');
    this.visualLayout.set(this.defaultCanvas(cue));
    this.activeVisualTemplateId.set(null);
    this.services
      .listLineupVisualSlides(this.organizationId, this.serviceId, cue.id)
      .subscribe({
        next: (scenes) => this.visualScenes.set(scenes),
        error: () => this.error.set('Cue views could not be loaded.'),
      });
  }

  closeCueSceneEditor(): void {
    this.activeCue.set(null);
    this.visualScenes.set([]);
    this.activeVisualSceneId.set(null);
    this.visualSceneName.set('');
  }

  newVisualScene(): void {
    this.activeVisualSceneId.set(null);
    this.visualSceneName.set(`${this.activeCue()?.title ?? 'Cue'} visual`);
    this.visualLayout.set(this.defaultCanvas(this.activeCue()));
    this.activeVisualTemplateId.set(null);
  }

  selectVisualScene(scene: LineupVisualSlideDto): void {
    this.activeVisualSceneId.set(scene.id);
    this.visualSceneName.set(scene.name);
    const target = this.visualTarget();
    const layout = scene.layouts.find((item) => item.target === target);
    this.activeVisualTemplateId.set(layout?.templateId ?? null);
    this.visualLayout.set(
      layout?.layout ?? this.defaultCanvas(this.activeCue()),
    );
  }

  chooseVisualTarget(target: OutputTarget): void {
    this.visualTarget.set(target);
    const active = this.visualScenes().find(
      (scene) => scene.id === this.activeVisualSceneId(),
    );
    const layout = active?.layouts.find((item) => item.target === target);
    this.activeVisualTemplateId.set(layout?.templateId ?? null);
    this.visualLayout.set(
      layout?.layout ?? this.defaultCanvas(this.activeCue()),
    );
  }

  visualLayoutOptions(): readonly CustomSelectOption[] {
    const kinds = templateKindsForLineupItem(this.activeCue()?.type ?? 'Text');
    return this.viewTemplates()
      .filter(
        (template) =>
          template.target === this.visualTarget() &&
          (template.kind === 'Default' || kinds.includes(template.kind)),
      )
      .map((template) => ({ value: template.id, label: template.name }));
  }

  selectVisualTemplate(templateId: string): void {
    const template = this.viewTemplates().find(
      (item) =>
        item.id === templateId &&
        item.target === this.visualTarget() &&
        (item.kind === 'Default' ||
          templateKindsForLineupItem(this.activeCue()?.type ?? 'Text').includes(
            item.kind,
          )),
    );
    if (!template) {
      this.error.set('Select a valid layout from Settings.');
      return;
    }
    const parsed = CanvasLayoutSchema.safeParse(template.layout);
    if (!parsed.success) {
      this.error.set('Select a valid layout from Settings.');
      return;
    }
    this.activeVisualTemplateId.set(template.id);
    this.visualLayout.set(
      template.kind === 'Default'
        ? adaptDefaultCanvasLayout(
            parsed.data,
            this.activeCue()?.type ?? 'Text',
          )
        : parsed.data,
    );
  }

  setVisualLayout(layout: CanvasLayoutDto): void {
    this.visualLayout.set(layout);
  }
  setVisualSceneName(name: string): void {
    this.visualSceneName.set(name);
  }

  saveVisualScene(): void {
    const cue = this.activeCue();
    const templateId = this.activeVisualTemplateId();
    if (
      !this.organizationId ||
      !this.serviceId ||
      !cue ||
      !templateId ||
      this.savingVisualScene()
    ) {
      if (!templateId)
        this.error.set(
          `Choose a ${this.visualTarget()} layout from Settings before saving this view.`,
        );
      return;
    }
    this.savingVisualScene.set(true);
    const current = this.visualScenes().find(
      (scene) => scene.id === this.activeVisualSceneId(),
    );
    const target = this.visualTarget();
    const layouts = current
      ? [
          ...current.layouts.filter((layout) => layout.target !== target),
          { target, templateId, layout: this.visualLayout() },
        ]
      : [{ target, templateId, layout: this.visualLayout() }];
    const request = current
      ? this.services.updateLineupVisualSlide(
          this.organizationId,
          this.serviceId,
          cue.id,
          current.id,
          { name: this.visualSceneName().trim() || current.name, layouts },
        )
      : this.services.createLineupVisualSlide(
          this.organizationId,
          this.serviceId,
          cue.id,
          {
            name: this.visualSceneName().trim() || `${cue.title} visual`,
            layouts,
          },
        );
    request.subscribe({
      next: (scene) => {
        this.visualScenes.update((scenes) =>
          current
            ? scenes.map((item) => (item.id === scene.id ? scene : item))
            : [...scenes, scene],
        );
        this.activeVisualSceneId.set(scene.id);
        this.savingVisualScene.set(false);
      },
      error: () => {
        this.error.set('Cue view could not be saved.');
        this.savingVisualScene.set(false);
      },
    });
  }

  removeVisualScene(): void {
    const cue = this.activeCue();
    const sceneId = this.activeVisualSceneId();
    if (
      !this.organizationId ||
      !this.serviceId ||
      !cue ||
      !sceneId ||
      this.savingVisualScene()
    )
      return;
    this.savingVisualScene.set(true);
    this.services
      .removeLineupVisualSlide(
        this.organizationId,
        this.serviceId,
        cue.id,
        sceneId,
      )
      .subscribe({
        next: () => {
          this.visualScenes.update((scenes) =>
            scenes.filter((scene) => scene.id !== sceneId),
          );
          this.activeVisualSceneId.set(null);
          this.visualLayout.set(this.defaultCanvas(cue));
          this.savingVisualScene.set(false);
        },
        error: () => {
          this.error.set('Cue view could not be removed.');
          this.savingVisualScene.set(false);
        },
      });
  }

  askRemoveVisualScene(): void {
    const sceneId = this.activeVisualSceneId();
    const scene = this.visualScenes().find((item) => item.id === sceneId);
    if (scene)
      this.confirmation.set({ kind: 'view', id: scene.id, label: scene.name });
  }

  assignMember(): void {
    if (
      !this.organizationId ||
      !this.serviceId ||
      this.teamForm.invalid ||
      this.savingAssignment()
    )
      return;
    this.savingAssignment.set(true);
    this.team
      .assign(this.organizationId, this.serviceId, this.teamForm.getRawValue())
      .subscribe({
        next: () => {
          this.teamForm.reset({ userId: '', role: '' });
          this.loadAssignments();
          this.savingAssignment.set(false);
        },
        error: () => {
          this.error.set('The team assignment could not be saved.');
          this.savingAssignment.set(false);
        },
      });
  }

  askRemoveAssignment(assignmentId: string, name: string): void {
    this.confirmation.set({
      kind: 'assignment',
      id: assignmentId,
      label: name,
    });
  }

  removeAssignment(assignmentId: string): void {
    if (!this.organizationId || !this.serviceId || this.removingAssignmentId())
      return;
    this.removingAssignmentId.set(assignmentId);
    this.team
      .remove(this.organizationId, this.serviceId, assignmentId)
      .subscribe({
        next: () => {
          this.loadAssignments();
          this.removingAssignmentId.set(null);
        },
        error: () => {
          this.error.set('The team assignment could not be removed.');
          this.removingAssignmentId.set(null);
        },
      });
  }

  confirmRemoval(): void {
    const choice = this.confirmation();
    if (!choice) return;
    this.confirmation.set(null);
    if (choice.kind === 'cue') this.removeCue(choice.id);
    else if (choice.kind === 'assignment') this.removeAssignment(choice.id);
    else this.removeVisualScene();
  }

  private reload(): void {
    if (!this.organizationId || !this.serviceId) return;
    this.services
      .get(this.organizationId, this.serviceId)
      .subscribe({ next: (service) => this.service.set(service) });
    this.loadAssignments();
  }

  private loadAssignments(): void {
    if (!this.organizationId || !this.serviceId) return;
    this.team
      .list(this.organizationId, this.serviceId)
      .subscribe({ next: (assignments) => this.assignments.set(assignments) });
  }

  private loadMembers(): void {
    if (!this.organizationId) return;
    this.organizations.getOverview(this.organizationId).subscribe({
      next: (overview) =>
        this.members.set(
          overview.members.filter((member) => member.user.active),
        ),
    });
  }

  private loadCueSources(): void {
    if (!this.organizationId) return;
    this.songsApi
      .list(this.organizationId)
      .subscribe({ next: (songs) => this.songs.set(songs) });
    this.bibleApi.listTranslations(this.organizationId).subscribe({
      next: (translations) => this.bibleTranslations.set(translations),
    });
    this.mediaApi
      .list(this.organizationId)
      .subscribe({ next: (media) => this.media.set(media) });
    this.slidesApi
      .list(this.organizationId)
      .subscribe({ next: (slides) => this.slides.set(slides) });
    this.slidesApi
      .listTemplates(this.organizationId)
      .subscribe({ next: (templates) => this.viewTemplates.set(templates) });
    this.countdownsApi
      .list(this.organizationId)
      .subscribe({ next: (countdowns) => this.countdowns.set(countdowns) });
  }

  private createLineupCue(input: CreateLineupItemRequestDto): void {
    if (!this.organizationId || !this.serviceId) return;
    this.services
      .addLineupItem(this.organizationId, this.serviceId, input)
      .subscribe({
        next: () => {
          this.resetCueForm();
          this.reload();
          this.savingCue.set(false);
        },
        error: () => {
          this.error.set('The cue could not be added.');
          this.savingCue.set(false);
        },
      });
  }

  private refreshActiveVisualScenes(): void {
    const cue = this.activeCue();
    if (!this.organizationId || !this.serviceId || !cue) return;
    this.services
      .listLineupVisualSlides(this.organizationId, this.serviceId, cue.id)
      .subscribe({
        next: (scenes) => {
          this.visualScenes.set(scenes);
          const active = scenes.find(
            (scene) => scene.id === this.activeVisualSceneId(),
          );
          const layout = active?.layouts.find(
            (item) => item.target === this.visualTarget(),
          );
          if (layout) {
            this.activeVisualTemplateId.set(layout.templateId ?? null);
            this.visualLayout.set(layout.layout);
          }
        },
      });
  }

  private defaultCanvas(cue: LineupItemDto | null = null): CanvasLayoutDto {
    const dynamicType =
      cue?.type === 'Song'
        ? 'Lyrics'
        : cue?.type === 'Bible'
          ? 'Scripture'
          : cue?.type === 'Countdown'
            ? 'Timer'
            : cue?.type === 'Clock'
              ? 'Clock'
              : ['Image', 'Video'].includes(cue?.type ?? '')
                ? 'Image'
                : 'Text';
    return {
      version: 1,
      size: { width: 1920, height: 1080, orientation: 'H' },
      background: { color: '#10130e' },
      elements: [
        {
          id: 'primary-content',
          type: dynamicType,
          x: 10,
          y: 24,
          width: 80,
          height: 38,
          zIndex: 1,
          style: {
            color: '#ffffff',
            fontSize: 5,
            fontFamily: 'Georgia',
            textAlign: 'center',
          },
          data: dynamicType === 'Text' ? { text: cue?.title ?? 'Text' } : {},
        },
      ],
    };
  }

  ngOnDestroy(): void {
    this.serviceEvents?.unsubscribe();
  }
}
