import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnDestroy,
  signal,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  CanvasLayoutSchema,
  liveBibleVerseAtStep,
  liveBibleVerseReference,
  LiveBibleContentSchema,
  LyricPaginationSchema,
  type LiveCountdownStateDto,
  type LiveCueDto,
  type LiveStateDto,
} from '@worship/shared-dto';
import { LiveOutputStateService } from '../../core/live-output-state.service';
import { LiveCanvasComponent } from '../../shared/live-canvas/live-canvas';

@Component({
  selector: 'app-live-output-page',
  imports: [LiveCanvasComponent],
  templateUrl: './live-output.html',
  styleUrl: './live-output.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LiveOutputPage implements OnDestroy {
  readonly output =
    inject(ActivatedRoute).snapshot.paramMap.get('output') ?? 'main';
  protected readonly clock = signal(Date.now());
  private readonly clockTimer = setInterval(
    () => this.clock.set(Date.now()),
    1_000,
  );
  constructor(
    private readonly route: ActivatedRoute,
    readonly live: LiveOutputStateService,
  ) {
    const sessionId = this.route.snapshot.paramMap.get('sessionId');
    const key = this.route.snapshot.queryParamMap.get('key');
    if (sessionId && key) this.live.connect(sessionId, key);
  }

  protected cueForOutput(state: LiveStateDto): LiveStateDto['program'] {
    return this.output === 'preview' ? state.preview : state.program;
  }

  protected isStageOutput(): boolean {
    return this.output === 'stage' || this.output === 'prompter';
  }

  protected bibleVerses(
    cue: LiveCueDto | null,
    visualStep = cue?.visualStep ?? 0,
  ): readonly { text: string; reference: string }[] {
    if (!cue) return [];
    const bible = LiveBibleContentSchema.safeParse(cue.content['bible']);
    if (!bible.success) return [];
    const verse = liveBibleVerseAtStep(bible.data, visualStep);
    return verse
      ? [
          {
            text: verse.text,
            reference: liveBibleVerseReference(bible.data, verse),
          },
        ]
      : [];
  }

  protected cueLines(cue: LiveCueDto | null): readonly string[] {
    if (!cue) return [];
    const bible = this.bibleVerses(cue);
    if (bible.length) return bible.map((verse) => verse.text);
    const song = cue.content['song'];
    if (song && typeof song === 'object') {
      if (
        'activeSection' in song &&
        song.activeSection &&
        typeof song.activeSection === 'object' &&
        'content' in song.activeSection &&
        typeof song.activeSection.content === 'string'
      )
        return [song.activeSection.content];
      if ('sections' in song && Array.isArray(song.sections))
        return song.sections.flatMap((section) =>
          section &&
          typeof section === 'object' &&
          'content' in section &&
          typeof section.content === 'string'
            ? [section.content]
            : [],
        );
    }
    const text = cue.content['text'];
    return typeof text === 'string' ? [text] : [];
  }

  protected clockDisplay(): string {
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    }).format(this.clock());
  }

  protected outputTarget(): 'Main' | 'Stage' | 'Prompter' | 'Alpha' {
    return (
      (
        {
          main: 'Main',
          stage: 'Stage',
          prompter: 'Prompter',
          alpha: 'Alpha',
        } as const
      )[this.output] ?? 'Main'
    );
  }

  protected hasVisualLayout(cue: LiveCueDto): boolean {
    const rootScene = cue.content['activeVisualSlide'];
    const song = cue.content['song'];
    const active =
      rootScene ??
      (song && typeof song === 'object' && 'activeVisualSlide' in song
        ? song.activeVisualSlide
        : null);
    const hasCueView = !!(
      active &&
      typeof active === 'object' &&
      'layouts' in active &&
      Array.isArray(active.layouts) &&
      active.layouts.some(
        (layout) =>
          layout &&
          typeof layout === 'object' &&
          'target' in layout &&
          layout.target === this.outputTarget(),
      )
    );
    if (hasCueView) return true;
    const slide = cue.content['slide'];
    const layout =
      slide &&
      typeof slide === 'object' &&
      'content' in slide &&
      slide.content &&
      typeof slide.content === 'object' &&
      'layout' in slide.content
        ? slide.content.layout
        : undefined;
    return CanvasLayoutSchema.safeParse(layout).success;
  }

  protected hasCanvasTimer(state: LiveStateDto): boolean {
    const cue = this.isStageOutput() ? state.program : this.cueForOutput(state);
    if (!cue) return false;
    const rootScene = cue.content['activeVisualSlide'];
    const song = cue.content['song'];
    const active =
      rootScene ??
      (song && typeof song === 'object' && 'activeVisualSlide' in song
        ? song.activeVisualSlide
        : null);
    const selected =
      active &&
      typeof active === 'object' &&
      'layouts' in active &&
      Array.isArray(active.layouts)
        ? active.layouts.find(
            (item) =>
              item &&
              typeof item === 'object' &&
              'target' in item &&
              item.target === this.outputTarget() &&
              'layout' in item,
          )
        : null;
    const slide = cue.content['slide'];
    const fallback =
      slide &&
      typeof slide === 'object' &&
      'content' in slide &&
      slide.content &&
      typeof slide.content === 'object' &&
      'layout' in slide.content
        ? slide.content.layout
        : undefined;
    const layout =
      selected && typeof selected === 'object' && 'layout' in selected
        ? selected.layout
        : fallback;
    const parsed = CanvasLayoutSchema.safeParse(layout);
    return (
      parsed.success &&
      parsed.data.elements.some((element) => element.type === 'Timer')
    );
  }

  protected prompterNextStep(
    state: LiveStateDto,
  ): { cue: LiveCueDto; step: number } | null {
    if (this.output !== 'prompter' || !state.program) return null;
    const step = state.program.visualStep + 1;
    return step < this.visualStepCount(state.program)
      ? { cue: state.program, step }
      : null;
  }

  protected nextCue(
    state: LiveStateDto,
    cue: LiveCueDto,
  ): LiveCueDto | null {
    return state.preview?.lineupItemId !== cue.lineupItemId
      ? state.preview
      : null;
  }

  private visualStepCount(cue: LiveCueDto): number {
    const bible = LiveBibleContentSchema.safeParse(cue.content['bible']);
    if (bible.success) return bible.data.verses.length;
    if (!cue.visualSlideId) return 0;
    const rootScene = cue.content['activeVisualSlide'];
    const song = cue.content['song'];
    const active =
      rootScene ??
      (song && typeof song === 'object' && 'activeVisualSlide' in song
        ? song.activeVisualSlide
        : null);
    if (
      !active ||
      typeof active !== 'object' ||
      !('layouts' in active) ||
      !Array.isArray(active.layouts)
    )
      return 0;
    return Math.max(
      0,
      ...(active.layouts as readonly unknown[]).map((layout) => {
        if (
          !layout ||
          typeof layout !== 'object' ||
          !('layout' in layout) ||
          !layout.layout ||
          typeof layout.layout !== 'object' ||
          !('elements' in layout.layout) ||
          !Array.isArray(layout.layout.elements)
        )
          return 0;
        return Math.max(
          0,
          ...(layout.layout.elements as readonly unknown[]).map((element) => {
            if (
              !element ||
              typeof element !== 'object' ||
              !('type' in element) ||
              element.type !== 'Lyrics' ||
              !('data' in element) ||
              !element.data ||
              typeof element.data !== 'object'
            )
              return 0;
            const pagination = LyricPaginationSchema.safeParse(
              (element.data as Record<string, unknown>)['lyricPagination'],
            );
            return pagination.success
              ? pagination.data.stepMap
                ? Math.max(...pagination.data.stepMap)
                : pagination.data.pages.length
              : 0;
          }),
        );
      }),
    );
  }

  protected countdownDisplay(countdown: LiveCountdownStateDto): string {
    const seconds =
      countdown.status === 'Running' && countdown.endsAt
        ? Math.max(
            0,
            Math.ceil(
              (new Date(countdown.endsAt).getTime() - this.clock()) / 1_000,
            ),
          )
        : countdown.remainingSeconds;
    return `${Math.floor(seconds / 60)
      .toString()
      .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
  }

  protected countdownForOutput(
    countdown: LiveCountdownStateDto | null,
  ): LiveCountdownStateDto | null {
    if (!countdown) return null;
    return countdown.visibleOn.includes(this.outputTarget()) ? countdown : null;
  }

  ngOnDestroy(): void {
    clearInterval(this.clockTimer);
    this.live.disconnect();
  }
}
