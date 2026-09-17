import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import {
  CanvasLayoutSchema,
  liveBibleVerseAtStep,
  liveBibleVerseReference,
  LiveBibleContentSchema,
  type CanvasElementDto,
  type CanvasLayoutDto,
  type LiveCountdownStateDto,
  type LiveCueDto,
  type OutputTarget,
} from '@worship/shared-dto';
import { resolveSongCanvasText } from './canvas-runtime';

interface ScriptureVerseDisplay {
  readonly text: string;
  readonly reference: string;
}

/** Renders a saved visual layout locally in each Live output. */
@Component({
  selector: 'worship-live-canvas',
  templateUrl: './live-canvas.html',
  styleUrl: './live-canvas.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LiveCanvasComponent {
  @Input({ required: true }) cue!: LiveCueDto;
  @Input({ required: true }) target!: OutputTarget;
  @Input() now = Date.now();
  @Input() countdown: LiveCountdownStateDto | null = null;
  @Input() nextCue: LiveCueDto | null = null;
  /** Prompter uses this to render the next global step without mutating live state. */
  @Input() visualStepOverride: number | null = null;
  /** Control-room thumbnails can render another song section without changing Preview. */
  @Input() visualSlideIdOverride: string | null = null;

  layout() {
    const rootScene = this.cue.content['activeVisualSlide'];
    const song = this.cue.content['song'];
    const songRecord =
      song && typeof song === 'object'
        ? (song as Record<string, unknown>)
        : null;
    const selectedSongScene =
      songRecord &&
      Array.isArray(songRecord['visualSlides']) &&
      this.visualSlideIdOverride
        ? (songRecord['visualSlides'] as readonly unknown[]).find(
            (slide) =>
              slide &&
              typeof slide === 'object' &&
              'id' in slide &&
              slide.id === this.visualSlideIdOverride,
          )
        : null;
    const active =
      selectedSongScene ??
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
      return this.slideLayout();
    const selected = active.layouts.find(
      (layout) =>
        layout &&
        typeof layout === 'object' &&
        'target' in layout &&
        layout.target === this.target &&
        'layout' in layout,
    );
    if (!selected || typeof selected !== 'object' || !('layout' in selected))
      return null;
    const parsed = CanvasLayoutSchema.safeParse(selected.layout);
    return parsed.success ? parsed.data : this.slideLayout();
  }

  private slideLayout() {
    const slide = this.cue.content['slide'];
    if (
      !slide ||
      typeof slide !== 'object' ||
      !('content' in slide) ||
      !slide.content ||
      typeof slide.content !== 'object' ||
      !('layout' in slide.content)
    )
      return null;
    const parsed = CanvasLayoutSchema.safeParse(slide.content.layout);
    return parsed.success ? parsed.data : null;
  }

  lyrics(element: CanvasElementDto): string {
    return resolveSongCanvasText(this.cue, this.target, 'current', {
      visualSlideId: this.visualSlideIdOverride,
      visualStep: this.visualStepOverride,
      element,
    });
  }

  nextStep(): string {
    const bible = LiveBibleContentSchema.safeParse(this.cue.content['bible']);
    if (bible.success) {
      const currentStep = this.visualStepOverride ?? this.cue.visualStep;
      return (
        liveBibleVerseAtStep(bible.data, currentStep + 1)?.text ??
        this.nextCue?.title ??
        ''
      );
    }
    return (
      resolveSongCanvasText(this.cue, this.target, 'next', {
        visualSlideId: this.visualSlideIdOverride,
        visualStep: this.visualStepOverride,
      }) ||
      this.nextCue?.title ||
      ''
    );
  }

  sectionLabel(element?: CanvasElementDto): string {
    const song = this.cue.content['song'];
    if (!song || typeof song !== 'object') return '';
    const songRecord = song as Record<string, unknown>;
    const slideId = this.visualSlideIdOverride ?? this.cue.visualSlideId;
    const slide = Array.isArray(songRecord['visualSlides'])
      ? (songRecord['visualSlides'] as readonly unknown[]).find(
          (item) =>
            item &&
            typeof item === 'object' &&
            'id' in item &&
            item.id === slideId,
        )
      : null;
    const sectionId =
      slide && typeof slide === 'object' && 'sectionId' in slide
        ? slide.sectionId
        : null;
    const section = Array.isArray(songRecord['sections'])
      ? (songRecord['sections'] as readonly unknown[]).find(
          (item) =>
            item &&
            typeof item === 'object' &&
            'id' in item &&
            item.id === sectionId,
        )
      : songRecord['activeSection'];
    const label =
      section &&
      typeof section === 'object' &&
      'label' in section &&
      typeof section.label === 'string'
        ? section.label
        : '';
    const prefix = element?.data['prefix'];
    return `${typeof prefix === 'string' ? prefix : ''}${label}`;
  }

  scriptureVerses(): readonly ScriptureVerseDisplay[] {
    const bible = LiveBibleContentSchema.safeParse(this.cue.content['bible']);
    if (!bible.success) return [];
    const verse = liveBibleVerseAtStep(
      bible.data,
      this.visualStepOverride ?? this.cue.visualStep,
    );
    return verse
      ? [
          {
            text: verse.text,
            reference: liveBibleVerseReference(bible.data, verse),
          },
        ]
      : [];
  }

  text(element: CanvasElementDto): string {
    const value = element.data['text'];
    return typeof value === 'string' ? value : '';
  }

  imageUrl(element: CanvasElementDto): string | null {
    const value = element.data['url'];
    if (typeof value === 'string' && value.length) return value;
    const media = this.cue.content['media'];
    return media &&
      typeof media === 'object' &&
      'url' in media &&
      typeof media.url === 'string'
      ? media.url
      : null;
  }

  isVideo(element: CanvasElementDto): boolean {
    if (element.type === 'Video') return true;
    const media = this.cue.content['media'];
    return (
      element.type === 'Image' &&
      !!media &&
      typeof media === 'object' &&
      'kind' in media &&
      (media.kind === 'VIDEO' ||
        media.kind === 'MOTION_BACKGROUND' ||
        media.kind === 'COUNTDOWN_VIDEO')
    );
  }

  canRenderVideo(): boolean {
    return this.target !== 'Stage' && this.target !== 'Prompter';
  }

  mediaLabel(): string {
    return this.cue.title;
  }

  color(element: CanvasElementDto): string | null {
    const value = element.style['color'];
    return typeof value === 'string' ? value : null;
  }

  fontFamily(element: CanvasElementDto): string | null {
    const value = element.style['fontFamily'];
    return typeof value === 'string' ? value : null;
  }

  fontSize(element: CanvasElementDto): number | null {
    const value = element.style['fontSize'];
    return typeof value === 'number' ? value : null;
  }

  textAlign(element: CanvasElementDto): string {
    const value = element.style['textAlign'];
    return value === 'left' || value === 'right' || value === 'center'
      ? value
      : 'center';
  }

  verticalAlign(element: CanvasElementDto): string {
    const value = element.style['verticalAlign'];
    return value === 'top' ? 'start' : value === 'bottom' ? 'end' : 'center';
  }

  backgroundColor(): string | null {
    const value = this.layout()?.background['color'];
    return typeof value === 'string' ? value : null;
  }

  backgroundImage(): string | null {
    const background = this.layout()?.background;
    if (!background) return null;
    if (background['kind'] === 'image' && typeof background['url'] === 'string')
      return `url("${background['url']}")`;
    const gradient = background['gradient'];
    return typeof gradient === 'string' && gradient.length ? gradient : null;
  }

  backgroundVideo(): string | null {
    const background = this.layout()?.background;
    return background?.['kind'] === 'video' &&
      typeof background['url'] === 'string'
      ? background['url']
      : null;
  }

  elementBackground(element: CanvasElementDto): string | null {
    const value = element.style['backgroundColor'];
    return typeof value === 'string' ? value : null;
  }

  elementBorder(element: CanvasElementDto): string | null {
    const value = element.style['borderColor'];
    return typeof value === 'string' ? `1px solid ${value}` : null;
  }

  elementPadding(element: CanvasElementDto): string | null {
    const value = element.style['padding'];
    return typeof value === 'number' ? `${value}cqh` : null;
  }

  aspectRatio(layout: CanvasLayoutDto): number {
    return layout.size.width / layout.size.height;
  }

  clock(element?: CanvasElementDto): string {
    const format = element?.data['format'];
    if (format === 'date')
      return new Intl.DateTimeFormat(undefined, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }).format(this.now);
    if (format === 'dateTime')
      return new Intl.DateTimeFormat(undefined, {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }).format(this.now);
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    }).format(this.now);
  }

  timer(): string | null {
    const countdown = this.countdown;
    if (!countdown) return null;
    const remaining =
      countdown.status === 'Running' && countdown.endsAt
        ? Math.max(
            0,
            Math.ceil(
              (new Date(countdown.endsAt).getTime() - this.now) / 1_000,
            ),
          )
        : countdown.remainingSeconds;
    return `${Math.floor(remaining / 60)
      .toString()
      .padStart(2, '0')}:${(remaining % 60).toString().padStart(2, '0')}`;
  }

  countdownLabel(): string {
    return this.countdown ? `COUNTDOWN ${this.countdown.name}` : '';
  }
}
