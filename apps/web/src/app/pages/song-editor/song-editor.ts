import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnDestroy,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin, Subscription } from 'rxjs';
import {
  applySongStepPagination,
  CanvasLayoutSchema,
  type CanvasLayoutDto,
  type OutputTarget,
  type SlideTemplateDto,
  type SongDto,
  type SongSectionInputDto,
  type SongTranslationDto,
  type SongVisualSlideDto,
} from '@worship/shared-dto';
import { AuthSessionStore } from '../../core/auth-session.store';
import { SongsApiService } from '../../core/songs-api.service';
import { CanvasEditorComponent } from '../../shared/canvas-editor/canvas-editor';
import { SlidesApiService } from '../../core/slides-api.service';
import { EventBusService } from '../../core/event-bus.service';
import {
  CustomSelectComponent,
  type CustomSelectOption,
} from '../../shared/custom-select/custom-select';

type EditableSongSection = SongSectionInputDto & { readonly id?: string };

@Component({
  selector: 'app-song-editor-page',
  imports: [RouterLink, CanvasEditorComponent, CustomSelectComponent],
  templateUrl: './song-editor.html',
  styleUrl: './song-editor.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SongEditorPage implements OnDestroy {
  readonly song = signal<SongDto | null>(null);
  readonly activeLocale = signal('');
  readonly title = signal('');
  readonly sections = signal<readonly EditableSongSection[]>([]);
  readonly translations = signal<readonly SongTranslationDto[]>([]);
  readonly saving = signal(false);
  readonly generating = signal(false);
  readonly regeneratingSteps = signal(false);
  readonly manualStepDrafts = signal<Record<string, string>>({});
  readonly view = signal<'lyrics' | 'visual'>('lyrics');
  readonly visualSlides = signal<readonly SongVisualSlideDto[]>([]);
  readonly activeVisualSlideId = signal<string | null>(null);
  readonly activeOutput = signal<OutputTarget>('Main');
  readonly visualLayout = signal<CanvasLayoutDto>(this.defaultCanvas());
  readonly visualSaving = signal(false);
  readonly visualError = signal<string | null>(null);
  readonly templates = signal<readonly SlideTemplateDto[]>([]);
  readonly activeTemplateId = signal<string | null>(null);
  readonly sectionTypeOptions: readonly CustomSelectOption[] = [
    { value: 'Intro', label: 'Intro' },
    { value: 'Verse', label: 'Verse' },
    { value: 'Pre-Chorus', label: 'Pre-Chorus' },
    { value: 'Chorus', label: 'Chorus' },
    { value: 'Bridge', label: 'Bridge' },
    { value: 'Tag', label: 'Tag' },
    { value: 'Ending', label: 'Ending' },
  ];
  readonly showPaste = signal(false);
  readonly pastedLyrics = signal('');
  private readonly organizationId =
    inject(AuthSessionStore).session()?.memberships[0]?.organizationId;
  private readonly songId =
    inject(ActivatedRoute).snapshot.paramMap.get('songId');
  private templateEvents?: Subscription;

  constructor(
    private readonly songs: SongsApiService,
    private readonly slides: SlidesApiService,
    private readonly events: EventBusService,
  ) {
    this.load();
    this.loadTemplates();
    this.templateEvents = this.events.events$.subscribe((event) => {
      if (
        event.organizationId === this.organizationId &&
        event.type.startsWith('slide.template.')
      ) {
        this.loadTemplates();
        this.refreshVisualSlides();
      }
    });
  }

  ngOnDestroy(): void {
    this.templateEvents?.unsubscribe();
  }

  openLocale(locale: string): void {
    const song = this.song();
    if (!song || !locale) return;
    this.activeLocale.set(locale);
    this.view.set('lyrics');
    if (locale === song.locale)
      return this.apply(song.title, song.sections, true);
    const translation = this.translations().find(
      (item) => item.locale === locale,
    );
    this.apply(
      translation?.title ?? song.title,
      translation?.sections ?? song.sections,
    );
  }

  updateTitle(value: string): void {
    this.title.set(value);
  }

  manualSteps(sectionId: string): string {
    return this.manualStepDrafts()[sectionId] ?? '';
  }

  setManualSteps(sectionId: string, value: string): void {
    this.manualStepDrafts.update((drafts) => ({
      ...drafts,
      [sectionId]: value,
    }));
  }

  saveManualSteps(sectionId: string): void {
    if (!this.organizationId || !this.songId || this.saving()) return;
    const steps = this.manualSteps(sectionId)
      .split(/\r?\n\s*\r?\n/)
      .map((step) => step.trim())
      .filter(Boolean);
    if (!steps.length) return;
    this.saving.set(true);
    this.songs
      .replaceSectionSteps(this.organizationId, this.songId, sectionId, {
        steps,
      })
      .subscribe({
        next: (song) => {
          this.acceptUpdatedSong(song);
          this.saving.set(false);
        },
        error: () => this.saving.set(false),
      });
  }

  regenerateSteps(): void {
    if (!this.organizationId || !this.songId || this.regeneratingSteps())
      return;
    if (
      !window.confirm(
        'Recreate every canonical step from the current Alpha rules? Manual step edits will be replaced.',
      )
    )
      return;
    this.regeneratingSteps.set(true);
    this.songs.regenerateSteps(this.organizationId, this.songId).subscribe({
      next: (song) => {
        this.acceptUpdatedSong(song);
        this.regeneratingSteps.set(false);
      },
      error: () => this.regeneratingSteps.set(false),
    });
  }

  updateSection(
    index: number,
    field: keyof SongSectionInputDto,
    value: string,
  ): void {
    this.sections.update((sections) => {
      const updated = sections.map((section, position) => {
        if (position !== index) return section;
        if (field === 'type') {
          return { ...section, type: value as SongSectionInputDto['type'] };
        }
        return field === 'label'
          ? { ...section, label: value }
          : { ...section, content: value };
      });
      return field === 'type' ? this.withAutomaticLabels(updated) : updated;
    });
  }

  addSection(): void {
    this.sections.update((sections) =>
      this.withAutomaticLabels([
        ...sections,
        { type: 'Verse', label: '', content: '' },
      ]),
    );
  }

  private withAutomaticLabels(
    sections: readonly EditableSongSection[],
  ): EditableSongSection[] {
    const occurrences = new Map<SongSectionInputDto['type'], number>();
    return sections.map((section) => {
      const occurrence = (occurrences.get(section.type) ?? 0) + 1;
      occurrences.set(section.type, occurrence);
      return { ...section, label: `${section.type} ${occurrence}` };
    });
  }

  importPastedLyrics(): void {
    const sections = this.parsePastedLyrics(this.pastedLyrics());
    if (!sections.length) return;
    this.sections.set(sections);
    this.showPaste.set(false);
    this.pastedLyrics.set('');
  }

  openVisualSlide(visualSlideId: string): void {
    const slide = this.visualSlides().find((item) => item.id === visualSlideId);
    if (!slide) return;
    this.view.set('visual');
    this.activeVisualSlideId.set(visualSlideId);
    this.activeOutput.set('Main');
    const layout = slide.layouts.find((item) => item.target === 'Main');
    this.activeTemplateId.set(layout?.templateId ?? null);
    this.visualLayout.set(layout?.layout ?? this.defaultCanvas());
    this.visualError.set(null);
  }

  openSongViews(): void {
    this.view.set('visual');
    const first = this.visualSlides()[0];
    if (first) this.openVisualSlide(first.id);
  }

  selectOutput(target: OutputTarget): void {
    const slide = this.activeVisualSlide();
    this.activeOutput.set(target);
    const layout = slide?.layouts.find((item) => item.target === target);
    this.activeTemplateId.set(layout?.templateId ?? null);
    this.visualLayout.set(layout?.layout ?? this.defaultCanvas());
    this.visualError.set(null);
  }

  layoutOptions(): readonly CustomSelectOption[] {
    return this.templates()
      .filter((template) => template.target === this.activeOutput())
      .map((template) => ({ value: template.id, label: template.name }));
  }

  selectTemplate(templateId: string): void {
    const template = this.templates().find(
      (item) => item.id === templateId && item.target === this.activeOutput(),
    );
    if (!template) return;
    const parsed = CanvasLayoutSchema.safeParse(template.layout);
    if (!parsed.success) {
      this.visualError.set(
        'This layout is not a valid canvas. Edit it in Settings first.',
      );
      return;
    }
    this.activeTemplateId.set(template.id);
    this.visualLayout.set(
      applySongStepPagination(parsed.data, this.activeSectionSteps()),
    );
    this.visualError.set(null);
  }

  createVisualSlide(sectionId: string, label: string): void {
    if (!this.organizationId || !this.songId || !this.isSource()) return;
    const template = this.templates().find((item) => item.target === 'Main');
    if (!template) {
      this.visualError.set(
        'Create a Main song layout in Views before creating a visual slide.',
      );
      return;
    }
    const parsed = CanvasLayoutSchema.safeParse(template.layout);
    if (!parsed.success) {
      this.visualError.set(
        'The selected Main layout is not a valid canvas. Edit it in Settings first.',
      );
      return;
    }
    this.visualSaving.set(true);
    this.songs
      .createVisualSlide(this.organizationId, this.songId, {
        sectionId,
        name: label,
        layouts: [
          { target: 'Main', templateId: template.id, layout: parsed.data },
        ],
      })
      .subscribe({
        next: (slide) => {
          this.visualSlides.update((items) => [...items, slide]);
          this.visualSaving.set(false);
          this.openVisualSlide(slide.id);
        },
        error: () => this.visualSaving.set(false),
      });
  }

  saveVisualSlide(): void {
    const slides = this.visualSlides();
    const templateId = this.activeTemplateId();
    const template = this.templates().find(
      (item) => item.id === templateId && item.target === this.activeOutput(),
    );
    const base = CanvasLayoutSchema.safeParse(template?.layout);
    if (
      !this.organizationId ||
      !this.songId ||
      !slides.length ||
      !templateId ||
      !base.success ||
      this.visualSaving()
    ) {
      if (!templateId)
        this.visualError.set(
          `Choose a ${this.activeOutput()} layout before saving this view.`,
        );
      return;
    }
    const target = this.activeOutput();
    this.visualSaving.set(true);
    const sections = new Map(
      this.song()?.sections.map((section) => [section.id, section]) ?? [],
    );
    forkJoin(
      slides.map((slide) =>
        this.songs.updateVisualSlide(
          this.organizationId!,
          this.songId!,
          slide.id,
          {
            layouts: [
              ...slide.layouts
                .filter((layout) => layout.target !== target)
                .map((layout) => ({
                  target: layout.target,
                  templateId: layout.templateId,
                  layout: layout.layout,
                })),
              {
                target,
                templateId,
                layout: applySongStepPagination(
                  base.data,
                  sections.get(slide.sectionId)?.steps ?? [],
                ),
              },
            ],
          },
        ),
      ),
    ).subscribe({
      next: (updated) => {
        this.visualSlides.set(updated);
        const active =
          updated.find((item) => item.id === this.activeVisualSlideId()) ??
          updated[0];
        const layout = active?.layouts.find((item) => item.target === target);
        if (active) this.activeVisualSlideId.set(active.id);
        if (layout) this.visualLayout.set(layout.layout);
        this.visualSaving.set(false);
        this.visualError.set(null);
      },
      error: () => {
        this.visualSaving.set(false);
        this.visualError.set('The song view assignment could not be saved.');
      },
    });
  }

  activeVisualSlide(): SongVisualSlideDto | null {
    return (
      this.visualSlides().find(
        (item) => item.id === this.activeVisualSlideId(),
      ) ?? null
    );
  }

  visualLyricPreview(slide: SongVisualSlideDto): string {
    return (
      this.song()?.sections.find((section) => section.id === slide.sectionId)
        ?.content ?? 'Your lyrics appear here'
    );
  }

  previewSectionName(): string {
    return this.activeVisualSlide()?.name ?? this.visualSlides()[0]?.name ?? '';
  }

  generate(): void {
    if (
      !this.organizationId ||
      !this.songId ||
      this.isSource() ||
      !this.activeLocale() ||
      this.generating()
    )
      return;
    this.generating.set(true);
    this.songs
      .generateTranslation(this.organizationId, this.songId, {
        targetLocale: this.activeLocale(),
      })
      .subscribe({
        next: (translation) => {
          this.upsertLocal(translation);
          this.apply(translation.title, translation.sections);
          this.generating.set(false);
        },
        error: () => this.generating.set(false),
      });
  }

  save(): void {
    const song = this.song();
    if (
      !this.organizationId ||
      !this.songId ||
      !song ||
      !this.title().trim() ||
      this.saving()
    )
      return;
    const sections = this.sections().filter(
      (section) => section.label.trim() && section.content.trim(),
    );
    this.saving.set(true);
    if (this.isSource()) {
      this.songs
        .update(this.organizationId, this.songId, {
          title: this.title(),
          sections,
        })
        .subscribe({
          next: (updated) => {
            this.acceptUpdatedSong(updated);
            this.saving.set(false);
          },
          error: () => this.saving.set(false),
        });
      return;
    }
    if (!sections.length) {
      this.saving.set(false);
      return;
    }
    this.songs
      .upsertTranslation(this.organizationId, this.songId, {
        locale: this.activeLocale(),
        title: this.title(),
        sections,
      })
      .subscribe({
        next: (translation) => {
          this.upsertLocal(translation);
          this.apply(translation.title, translation.sections);
          this.saving.set(false);
        },
        error: () => this.saving.set(false),
      });
  }

  isSource(): boolean {
    return this.activeLocale() === this.song()?.locale;
  }

  private load(): void {
    if (!this.organizationId || !this.songId) return;
    this.songs.get(this.organizationId, this.songId).subscribe({
      next: (song) => {
        this.acceptUpdatedSong(song);
        this.songs.listTranslations(this.organizationId!, song.id).subscribe({
          next: (translations) => this.translations.set(translations),
        });
        this.openLocale(song.locale);
      },
    });
  }

  private loadTemplates(): void {
    if (!this.organizationId) return;
    this.slides.listTemplates(this.organizationId).subscribe({
      next: (templates) =>
        this.templates.set(
          templates.filter((template) => template.kind === 'Song'),
        ),
    });
  }

  private refreshVisualSlides(): void {
    if (!this.organizationId || !this.songId) return;
    this.songs.listVisualSlides(this.organizationId, this.songId).subscribe({
      next: (slides) => {
        this.visualSlides.set(slides);
        const active = slides.find(
          (slide) => slide.id === this.activeVisualSlideId(),
        );
        const layout = active?.layouts.find(
          (item) => item.target === this.activeOutput(),
        );
        if (layout) {
          this.activeTemplateId.set(layout.templateId ?? null);
          this.visualLayout.set(layout.layout);
        }
      },
    });
  }

  private apply(
    title: string,
    sections: readonly SongSectionInputDto[],
    preserveSourceIds = false,
  ): void {
    this.title.set(title);
    this.sections.set(
      sections.map((section) => ({
        type: section.type,
        label: section.label,
        content: section.content,
        ...(preserveSourceIds &&
        'id' in section &&
        typeof section.id === 'string'
          ? { id: section.id }
          : {}),
      })),
    );
  }

  private upsertLocal(next: SongTranslationDto): void {
    this.translations.update((translations) => [
      next,
      ...translations.filter((item) => item.locale !== next.locale),
    ]);
  }

  private acceptUpdatedSong(song: SongDto): void {
    this.song.set(song);
    this.visualSlides.set(song.visualSlides);
    this.manualStepDrafts.set(
      Object.fromEntries(
        song.sections.map((section) => [
          section.id,
          section.steps.map((step) => step.content).join('\n\n'),
        ]),
      ),
    );
    if (this.activeLocale() === song.locale)
      this.apply(song.title, song.sections, true);
  }

  private defaultCanvas(): CanvasLayoutDto {
    return {
      version: 1,
      size: { width: 1920, height: 1080, orientation: 'H' },
      background: { color: '#090b0f' },
      elements: [
        {
          id: 'lyrics',
          type: 'Lyrics',
          x: 10,
          y: 36,
          width: 80,
          height: 28,
          zIndex: 1,
          style: {
            color: '#ffffff',
            fontSize: 7,
            fontFamily: 'Georgia',
            textAlign: 'center',
          },
          data: {},
        },
      ],
    };
  }

  private activeSectionSteps() {
    const slide = this.activeVisualSlide() ?? this.visualSlides()[0];
    return slide
      ? (this.song()?.sections.find((section) => section.id === slide.sectionId)
          ?.steps ?? [])
      : [];
  }

  private parsePastedLyrics(raw: string): SongSectionInputDto[] {
    const importedXml = this.parseSongXml(raw);
    if (importedXml.length) return importedXml;
    const headings: Record<string, SongSectionInputDto['type']> = {
      intro: 'Intro',
      verse: 'Verse',
      'pre-chorus': 'Pre-Chorus',
      prechorus: 'Pre-Chorus',
      chorus: 'Chorus',
      bridge: 'Bridge',
      tag: 'Tag',
      ending: 'Ending',
    };
    const result: SongSectionInputDto[] = [];
    let type: SongSectionInputDto['type'] = 'Verse';
    let label = 'Verse 1';
    let lines: string[] = [];
    const push = () => {
      const content = lines.join('\n').trim();
      if (content) result.push({ type, label, content });
      lines = [];
    };
    for (const line of raw.replace(/\r\n?/g, '\n').split('\n')) {
      const match = line
        .trim()
        .match(
          /^(verse|pre[ -]?chorus|chorus|bridge|tag|ending)\s*([\d\w-]*)\s*$/i,
        );
      if (match) {
        push();
        const key = match[1].toLowerCase().replace(' ', '-');
        type = headings[key] ?? 'Verse';
        const suffix = match[2]?.trim();
        label = `${type}${suffix ? ` ${suffix}` : ''}`;
      } else lines.push(line);
    }
    push();
    if (result.length) return result;
    return raw
      .split(/\n\s*\n/)
      .map((content, index) => ({
        type: 'Verse' as const,
        label: `Verse ${index + 1}`,
        content: content.trim(),
      }))
      .filter((section) => section.content.length > 0);
  }

  /** Accepts OpenLyrics/OpenSong XML pasted as text without adding an upload surface. */
  private parseSongXml(raw: string): SongSectionInputDto[] {
    if (!/^\s*(?:<\?xml|<song[\s>])/i.test(raw)) return [];
    const sections: SongSectionInputDto[] = [];
    const typeFor = (name: string): SongSectionInputDto['type'] => {
      const value = name.toLowerCase();
      if (/chorus|\bc\d*/.test(value)) return 'Chorus';
      if (/pre.?chorus|\bp\d*/.test(value)) return 'Pre-Chorus';
      if (/bridge|\bb\d*/.test(value)) return 'Bridge';
      if (/tag/.test(value)) return 'Tag';
      if (/ending|outro/.test(value)) return 'Ending';
      return 'Verse';
    };
    const decode = (value: string) =>
      value
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\r\n?/g, '\n')
        .trim();
    const versePattern = /<verse\b([^>]*)>([\s\S]*?)<\/verse>/gi;
    for (const match of raw.matchAll(versePattern)) {
      const name =
        /\b(?:name|id)=["']([^"']+)["']/i.exec(match[1])?.[1] ??
        `Verse ${sections.length + 1}`;
      const content = decode(match[2]);
      if (content) sections.push({ type: typeFor(name), label: name, content });
    }
    return sections;
  }
}
