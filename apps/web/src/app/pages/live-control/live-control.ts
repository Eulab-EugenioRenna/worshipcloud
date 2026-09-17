import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  inject,
  OnDestroy,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { LiveApiService } from '../../core/live-api.service';
import { LiveSessionStore } from '../../core/live-session.store';
import { AuthSessionStore } from '../../core/auth-session.store';
import { ServicesApiService } from '../../core/services-api.service';
import { EventBusService } from '../../core/event-bus.service';
import {
  liveBibleVerseReference,
  LiveBibleContentSchema,
  type LiveAction,
  type LiveActionRequestDto,
  type LiveCountdownStateDto,
  type LiveStateDto,
  type LineupItemDto,
} from '@worship/shared-dto';
import { ConfirmationDialogComponent } from '../../shared/confirmation-dialog/confirmation-dialog';
import { songSectionShortcut } from './live-control-shortcuts';

const PREVIEW_WIDTH_STORAGE_KEY = 'worship.live-control.preview-width';
const DEFAULT_PREVIEW_WIDTH = 260;
const MIN_PREVIEW_WIDTH = 180;
const MAX_PREVIEW_WIDTH = 420;

interface VisualStepCard {
  readonly visualSlideId: string | null;
  readonly sectionPosition: number | null;
  readonly step: number;
  readonly displayIndex: number;
  readonly label: string;
  readonly reference: string;
  readonly content: string;
  readonly shortcut: string;
}

@Component({
  selector: 'app-live-control-page',
  imports: [RouterLink, ConfirmationDialogComponent],
  templateUrl: './live-control.html',
  styleUrl: './live-control.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LiveControlPage implements OnDestroy {
  readonly sessionId =
    inject(ActivatedRoute).snapshot.paramMap.get('sessionId') ?? '';
  readonly lineup = signal<readonly LineupItemDto[]>([]);
  readonly pendingAction = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly confirmation = signal<'release' | 'end' | null>(null);
  readonly previewCardWidth = signal(this.restorePreviewCardWidth());
  readonly clock = signal(Date.now());
  private readonly clockTimer = setInterval(
    () => this.clock.set(Date.now()),
    1_000,
  );
  private lineupEvents?: Subscription;
  constructor(
    readonly store: LiveSessionStore,
    private readonly live: LiveApiService,
    private readonly auth: AuthSessionStore,
    private readonly services: ServicesApiService,
    private readonly events: EventBusService,
  ) {
    this.store.load(this.sessionId);
    const organizationId = this.auth.session()?.memberships[0]?.organizationId;
    this.live.get(this.sessionId).subscribe({
      next: (session) => {
        if (!organizationId) return;
        this.loadLineup(organizationId, session.serviceId);
        this.lineupEvents = this.events.events$.subscribe((event) => {
          if (
            event.payload.serviceId === session.serviceId &&
            event.type.startsWith('service.lineup')
          ) {
            this.loadLineup(organizationId, session.serviceId);
          }
        });
      },
    });
  }

  private loadLineup(organizationId: string, serviceId: string): void {
    this.services.get(organizationId, serviceId).subscribe({
      next: (service) => this.lineup.set(service.lineup),
      error: () => this.error.set('The run sheet could not be refreshed.'),
    });
  }
  setPreviewCardWidth(value: string): void {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    const width = Math.min(
      MAX_PREVIEW_WIDTH,
      Math.max(MIN_PREVIEW_WIDTH, parsed),
    );
    this.previewCardWidth.set(width);
    try {
      localStorage.setItem(PREVIEW_WIDTH_STORAGE_KEY, String(width));
    } catch {
      // The control remains usable when browser storage is unavailable.
    }
  }

  private restorePreviewCardWidth(): number {
    try {
      const stored = Number(localStorage.getItem(PREVIEW_WIDTH_STORAGE_KEY));
      return Number.isFinite(stored) &&
        stored >= MIN_PREVIEW_WIDTH &&
        stored <= MAX_PREVIEW_WIDTH
        ? stored
        : DEFAULT_PREVIEW_WIDTH;
    } catch {
      return DEFAULT_PREVIEW_WIDTH;
    }
  }

  currentUserId(): string | null {
    return this.auth.currentUser()?.id ?? null;
  }
  isOwner(state: LiveStateDto): boolean {
    return state.programOwnerId === this.currentUserId();
  }
  canControl(state: LiveStateDto): boolean {
    return (
      this.store.session()?.status === 'Live' &&
      this.isOwner(state) &&
      !this.pendingAction()
    );
  }
  requestControl(state: LiveStateDto): void {
    this.act(state.programOwnerId ? 'RequestProgramControl' : 'ClaimProgram');
  }
  act(
    action: LiveAction,
    extras: Omit<Partial<LiveActionRequestDto>, 'action'> = {},
  ): void {
    if (this.pendingAction()) return;
    const input: LiveActionRequestDto = { action, ...extras };
    this.pendingAction.set(action);
    this.error.set(null);
    this.live.act(this.sessionId, input).subscribe({
      next: (session) => this.store.setSession(session),
      error: () => {
        this.error.set(
          'The control state changed before this action could be applied. It has been left unchanged.',
        );
        this.pendingAction.set(null);
      },
      complete: () => this.pendingAction.set(null),
    });
  }
  start(sessionServiceId: string): void {
    const organizationId = this.auth.session()?.memberships[0]?.organizationId;
    if (!organizationId || this.pendingAction()) return;
    this.pendingAction.set('StartLive');
    this.error.set(null);
    this.live.start(organizationId, sessionServiceId).subscribe({
      next: (session) => this.store.setSession(session),
      error: () => {
        this.error.set(
          'The session could not be started. Its current state has not changed.',
        );
        this.pendingAction.set(null);
      },
      complete: () => this.pendingAction.set(null),
    });
  }
  preview(itemId: string): void {
    this.act('Preview', { lineupItemId: itemId });
  }
  previewSection(
    itemId: string | null | undefined,
    sectionPosition: number,
  ): void {
    if (!itemId) return;
    const current = this.store.state()?.preview;
    this.act('Preview', {
      lineupItemId: itemId,
      sectionPosition,
      ...(current?.lineupItemId === itemId && current.lineupVisualSlideId
        ? { lineupVisualSlideId: current.lineupVisualSlideId }
        : {}),
    });
  }
  previewVisualSlide(
    itemId: string | null | undefined,
    visualSlideId: string,
  ): void {
    if (!itemId) return;
    this.act('Preview', { lineupItemId: itemId, visualSlideId, visualStep: 0 });
  }
  previewVisualStep(state: LiveStateDto, visualStep: number): void {
    const cue = state.preview;
    if (!cue?.visualSlideId) return;
    this.act('Preview', {
      lineupItemId: cue.lineupItemId,
      visualSlideId: cue.visualSlideId,
      visualStep,
    });
  }
  takeVisualStep(
    state: LiveStateDto,
    visualStep: number,
    visualSlideId?: string | null,
    sectionPosition?: number | null,
  ): void {
    const cue = state.preview;
    const slideId = visualSlideId ?? cue?.visualSlideId;
    if (
      !cue ||
      (cue.type === 'Song' && !slideId) ||
      !this.canControl(state) ||
      this.pendingAction()
    )
      return;
    this.pendingAction.set('TakeStep');
    this.error.set(null);
    this.live
      .act(this.sessionId, {
        action: 'Preview',
        lineupItemId: cue.lineupItemId,
        visualStep,
        ...(slideId ? { visualSlideId: slideId } : {}),
        ...(sectionPosition !== undefined && sectionPosition !== null
          ? { sectionPosition }
          : cue.sectionPosition !== null
            ? { sectionPosition: cue.sectionPosition }
            : {}),
        ...(cue.lineupVisualSlideId
          ? { lineupVisualSlideId: cue.lineupVisualSlideId }
          : {}),
      })
      .subscribe({
        next: (previewed) => {
          this.store.setSession(previewed);
          this.live.act(this.sessionId, { action: 'Take' }).subscribe({
            next: (taken) => this.store.setSession(taken),
            error: () =>
              this.error.set(
                'The step was prepared but could not be taken to Program.',
              ),
            complete: () => this.pendingAction.set(null),
          });
        },
        error: () => {
          this.error.set('The selected step could not be prepared.');
          this.pendingAction.set(null);
        },
      });
  }
  takeBlank(state: LiveStateDto): void {
    if (!this.canControl(state)) return;
    this.act('Clear');
  }
  adjacentVisualStep(
    state: LiveStateDto,
    direction: -1 | 1,
  ): VisualStepCard | null {
    const cards = this.allVisualStepCards(state);
    if (!cards.length) return null;
    const currentIndex = cards.findIndex((card) =>
      this.isStepOnProgram(state, card),
    );
    if (currentIndex < 0) return direction === 1 ? cards[0] : null;
    return cards[currentIndex + direction] ?? null;
  }
  canMoveVisualStep(state: LiveStateDto, direction: -1 | 1): boolean {
    if (!this.canControl(state)) return false;
    if (this.adjacentVisualStep(state, direction)) return true;
    return direction === 1 && this.hasNextCue(state);
  }
  moveVisualStep(state: LiveStateDto, direction: -1 | 1): void {
    if (!this.canControl(state)) return;
    if (
      direction === 1 &&
      state.program &&
      state.preview?.lineupItemId !== state.program.lineupItemId
    ) {
      this.act('Take');
      return;
    }
    const target = this.adjacentVisualStep(state, direction);
    if (target) {
      this.takeVisualStep(
        state,
        target.step,
        target.visualSlideId,
        target.sectionPosition,
      );
      return;
    }
    if (direction === 1 && this.hasNextCue(state)) this.act('Next');
  }
  private hasNextCue(state: LiveStateDto): boolean {
    if (!state.program) return false;
    if (state.preview?.lineupItemId !== state.program.lineupItemId) return true;
    const programIndex = this.lineup().findIndex(
      (item) => item.id === state.program?.lineupItemId,
    );
    return programIndex >= 0 && programIndex < this.lineup().length - 1;
  }
  isStepOnProgram(state: LiveStateDto, card: VisualStepCard): boolean {
    const preview = state.preview;
    const program = state.program;
    if (!preview || !program || program.lineupItemId !== preview.lineupItemId)
      return false;
    return (
      program.visualStep === card.step &&
      (card.visualSlideId === null ||
        program.visualSlideId === card.visualSlideId)
    );
  }
  previewLineupVisualSlide(
    itemId: string | null | undefined,
    lineupVisualSlideId: string,
  ): void {
    if (!itemId) return;
    const current = this.store.state()?.preview;
    this.act('Preview', {
      lineupItemId: itemId,
      lineupVisualSlideId,
      ...(current?.lineupItemId === itemId && current.sectionPosition !== null
        ? { sectionPosition: current.sectionPosition }
        : {}),
    });
  }
  lineupVisualSlidesForPreview(
    state: LiveStateDto,
  ): readonly { id: string; name: string; position: number }[] {
    const scenes = state.preview?.content['visualSlides'];
    if (!Array.isArray(scenes)) return [];
    return scenes.flatMap((scene) => {
      if (!scene || typeof scene !== 'object') return [];
      const value = scene as Record<string, unknown>;
      return typeof value['id'] === 'string' &&
        typeof value['name'] === 'string' &&
        typeof value['position'] === 'number'
        ? [
            {
              id: value['id'],
              name: value['name'],
              position: value['position'],
            },
          ]
        : [];
    });
  }
  visualSlidesForPreview(
    state: LiveStateDto,
  ): readonly { id: string; name: string; position: number }[] {
    const song = state.preview?.content['song'];
    if (
      !song ||
      typeof song !== 'object' ||
      !('visualSlides' in song) ||
      !Array.isArray(song.visualSlides)
    )
      return [];
    const songRecord = song as Record<string, unknown>;
    const slides = songRecord['visualSlides'] as readonly unknown[];
    return slides.flatMap((slide) => {
      if (!slide || typeof slide !== 'object') return [];
      const value = slide as Record<string, unknown>;
      return typeof value['id'] === 'string' &&
        typeof value['name'] === 'string' &&
        typeof value['position'] === 'number'
        ? [
            {
              id: value['id'],
              name: value['name'],
              position: value['position'],
            },
          ]
        : [];
    });
  }
  visualSlideCards(state: LiveStateDto): readonly {
    id: string;
    name: string;
    position: number;
    content: string;
  }[] {
    const song = state.preview?.content['song'];
    if (
      !song ||
      typeof song !== 'object' ||
      !('visualSlides' in song) ||
      !Array.isArray(song.visualSlides)
    )
      return [];
    const sections =
      'sections' in song && Array.isArray(song.sections) ? song.sections : [];
    return song.visualSlides.flatMap((slide) => {
      if (!slide || typeof slide !== 'object') return [];
      const value = slide as Record<string, unknown>;
      const section = sections.find(
        (item) =>
          item &&
          typeof item === 'object' &&
          'id' in item &&
          item.id === value['sectionId'],
      );
      const content =
        section &&
        typeof section === 'object' &&
        'content' in section &&
        typeof section.content === 'string'
          ? section.content
          : '';
      return typeof value['id'] === 'string' &&
        typeof value['name'] === 'string' &&
        typeof value['position'] === 'number'
        ? [
            {
              id: value['id'],
              name: value['name'],
              position: value['position'],
              content,
            },
          ]
        : [];
    });
  }
  previewCopy(state: LiveStateDto): string {
    const song = state.preview?.content['song'];
    if (
      song &&
      typeof song === 'object' &&
      'activeSection' in song &&
      song.activeSection &&
      typeof song.activeSection === 'object' &&
      'content' in song.activeSection &&
      typeof song.activeSection.content === 'string'
    )
      return song.activeSection.content;
    const bible = state.preview?.content['bible'];
    if (
      bible &&
      typeof bible === 'object' &&
      'verses' in bible &&
      Array.isArray(bible.verses)
    )
      return bible.verses
        .flatMap((verse) =>
          verse &&
          typeof verse === 'object' &&
          'text' in verse &&
          typeof verse.text === 'string'
            ? [verse.text]
            : [],
        )
        .join('\n');
    return state.preview?.title ?? 'Choose a service item to prepare it.';
  }
  countdownPreview(state: LiveStateDto): string | null {
    const cue = state.preview;
    if (cue?.type !== 'Countdown') return null;
    if (state.countdown?.countdownId === cue.sourceId)
      return this.countdownDisplay(state.countdown);
    const countdown = cue.content['countdown'];
    if (!countdown || typeof countdown !== 'object') return null;
    const countdownRecord = countdown as Record<string, unknown>;
    const duration = countdownRecord['durationSeconds'];
    const targetAt = countdownRecord['targetAt'];
    const seconds =
      typeof targetAt === 'string'
        ? Math.max(
            0,
            Math.ceil((new Date(targetAt).getTime() - this.clock()) / 1_000),
          )
        : typeof duration === 'number'
          ? duration
          : null;
    return seconds === null ? null : this.formatCountdown(seconds);
  }
  private countdownDisplay(countdown: LiveCountdownStateDto): string {
    const seconds =
      countdown.status === 'Running' && countdown.endsAt
        ? Math.max(
            0,
            Math.ceil(
              (new Date(countdown.endsAt).getTime() - this.clock()) / 1_000,
            ),
          )
        : countdown.remainingSeconds;
    return this.formatCountdown(seconds);
  }
  private formatCountdown(seconds: number): string {
    return `${Math.floor(seconds / 60)
      .toString()
      .padStart(2, '0')}:${Math.floor(seconds % 60)
      .toString()
      .padStart(2, '0')}`;
  }
  allVisualStepCards(state: LiveStateDto): readonly VisualStepCard[] {
    const bible = LiveBibleContentSchema.safeParse(
      state.preview?.content['bible'],
    );
    if (bible.success) {
      return bible.data.verses.map((verse, step) => ({
        visualSlideId: null,
        sectionPosition: null,
        step,
        displayIndex: verse.verse,
        label: `VERSE ${verse.verse}`,
        reference: liveBibleVerseReference(bible.data, verse),
        content: verse.text,
        shortcut: '',
      }));
    }
    const song = state.preview?.content['song'];
    if (
      !song ||
      typeof song !== 'object' ||
      !('visualSlides' in song) ||
      !Array.isArray(song.visualSlides) ||
      !('sections' in song) ||
      !Array.isArray(song.sections)
    )
      return [];
    const songRecord = song as Record<string, unknown>;
    const slides = songRecord['visualSlides'] as readonly unknown[];
    const sections = songRecord['sections'] as readonly unknown[];
    const verseNumberBySectionId = new Map<string, number>();
    let verseNumber = 0;
    [...sections]
      .filter(
        (section): section is Record<string, unknown> =>
          !!section && typeof section === 'object',
      )
      .sort((left, right) => {
        const leftPosition = left['position'];
        const rightPosition = right['position'];
        return (
          (typeof leftPosition === 'number' ? leftPosition : 0) -
          (typeof rightPosition === 'number' ? rightPosition : 0)
        );
      })
      .forEach((section) => {
        if (section['type'] !== 'Verse' || typeof section['id'] !== 'string')
          return;
        verseNumber += 1;
        verseNumberBySectionId.set(section['id'], verseNumber);
      });
    let displayIndex = 0;
    return slides.flatMap((slide) => {
      if (!slide || typeof slide !== 'object') return [];
      const value = slide as Record<string, unknown>;
      if (
        typeof value['id'] !== 'string' ||
        typeof value['sectionId'] !== 'string' ||
        !Array.isArray(value['layouts'])
      )
        return [];
      const section = sections.find(
        (item: unknown) =>
          item &&
          typeof item === 'object' &&
          'id' in item &&
          item.id === value['sectionId'],
      );
      if (!section || typeof section !== 'object') return [];
      const sectionValue = section as Record<string, unknown>;
      if (typeof sectionValue['position'] !== 'number') return [];
      const sectionVerseNumber =
        typeof sectionValue['id'] === 'string'
          ? (verseNumberBySectionId.get(sectionValue['id']) ?? 0)
          : 0;
      const canonicalSteps = Array.isArray(sectionValue['steps'])
        ? sectionValue['steps'].flatMap((item) => {
            if (!item || typeof item !== 'object') return [];
            const step = item as Record<string, unknown>;
            return typeof step['position'] === 'number' && typeof step['content'] === 'string'
              ? [{ position: step['position'], content: step['content'] }]
              : [];
          }).sort((left, right) => left.position - right.position)
        : [];
      const steps = canonicalSteps.length
        ? canonicalSteps
        : [{ position: 0, content: typeof sectionValue['content'] === 'string' ? sectionValue['content'] : '' }];
      return steps.map((canonical, step) => {
        displayIndex += 1;
        return {
          visualSlideId: value['id'] as string,
          sectionPosition: sectionValue['position'] as number,
          step,
          displayIndex,
          label: `STEP ${displayIndex}`,
          reference: '',
          content: canonical.content,
          shortcut:
            step === 0
              ? songSectionShortcut(sectionValue['type'], sectionVerseNumber)
              : '',
        };
      });
    });
  }
  sectionsForPreview(
    state: LiveStateDto,
  ): readonly { position: number; label: string; type: string }[] {
    const song = state.preview?.content['song'];
    if (
      !song ||
      typeof song !== 'object' ||
      !('sections' in song) ||
      !Array.isArray(song.sections)
    )
      return [];
    return song.sections.flatMap((section) => {
      if (
        !section ||
        typeof section !== 'object' ||
        !('position' in section) ||
        !('label' in section)
      )
        return [];
      const value = section as Record<string, unknown>;
      return typeof value['position'] === 'number' &&
        typeof value['label'] === 'string'
        ? [
            {
              position: value['position'],
              label: value['label'],
              type:
                typeof value['type'] === 'string' ? value['type'] : 'Section',
            },
          ]
        : [];
    });
  }
  startCountdown(item: LineupItemDto, includeMain = false): void {
    if (item.sourceId)
      this.act('StartCountdown', {
        countdownId: item.sourceId,
        countdownTargets: includeMain
          ? ['Main', 'Stage', 'Prompter']
          : ['Stage', 'Prompter'],
      });
  }
  confirm(): void {
    const choice = this.confirmation();
    if (!choice) return;
    this.confirmation.set(null);
    this.act(choice === 'end' ? 'End' : 'ReleaseProgram');
  }

  @HostListener('window:keydown', ['$event'])
  onKeyboardShortcut(event: KeyboardEvent): void {
    const target = event.target;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      (target instanceof HTMLElement && target.isContentEditable)
    )
      return;
    const state = this.store.state();
    if (!state || !this.canControl(state)) return;
    const key = event.key.toLowerCase();
    if (key === 'escape') {
      event.preventDefault();
      this.takeBlank(state);
      return;
    }
    if (key === 'arrowleft' || key === 'arrowright') {
      event.preventDefault();
      this.moveVisualStep(state, key === 'arrowleft' ? -1 : 1);
      return;
    }
    if (key === 'arrowup' || key === 'arrowdown') {
      event.preventDefault();
      this.act(key === 'arrowup' ? 'Previous' : 'Next');
      return;
    }
    if (!state.preview) return;
    const shortcut = /^[1-9]$/.test(key) ? key : key.toUpperCase();
    const match = this.allVisualStepCards(state).find(
      (card) => card.shortcut === shortcut,
    );
    if (!match) return;
    event.preventDefault();
    this.takeVisualStep(
      state,
      match.step,
      match.visualSlideId,
      match.sectionPosition,
    );
  }

  ngOnDestroy(): void {
    clearInterval(this.clockTimer);
    this.lineupEvents?.unsubscribe();
    this.store.stop();
  }
}
