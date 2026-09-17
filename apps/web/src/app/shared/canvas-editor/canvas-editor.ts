import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, Output, ViewChild, signal } from '@angular/core';
import { CanvasLayoutSchema, LyricPaginationSchema, type CanvasElementDto, type CanvasElementType, type CanvasLayoutDto } from '@worship/shared-dto';

@Component({
  selector: 'worship-canvas-editor',
  templateUrl: './canvas-editor.html',
  styleUrl: './canvas-editor.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CanvasEditorComponent {
  @Input({ required: true }) layout!: CanvasLayoutDto;
  @Input() lyricPreview = 'Your lyrics appear here';
  @Input() stepGenerator = false;
  /** Song views may group lyric lines only; Settings owns structure, position and styling. */
  @Input() mode: 'full' | 'position' | 'pagination' = 'full';
  @Output() layoutChange = new EventEmitter<CanvasLayoutDto>();
  @ViewChild('surface') private surface?: ElementRef<HTMLElement>;

  readonly selectedId = signal<string | null>(null);
  readonly preview = signal<CanvasElementDto | null>(null);
  private drag?: { id: string; mode: 'move' | 'resize'; startX: number; startY: number; initial: CanvasElementDto; rect: DOMRect };

  selected(): CanvasElementDto | null {
    return this.layout.elements.find((element) => element.id === this.selectedId()) ?? null;
  }

  select(id: string): void { this.selectedId.set(id); }

  display(element: CanvasElementDto): CanvasElementDto {
    const preview = this.preview();
    return preview?.id === element.id ? preview : element;
  }

  beginPointer(event: PointerEvent, element: CanvasElementDto, mode: 'move' | 'resize'): void {
    if (this.mode !== 'full') return;
    event.preventDefault();
    event.stopPropagation();
    const rect = this.surface?.nativeElement.getBoundingClientRect();
    if (!rect) return;
    this.select(element.id);
    this.drag = { id: element.id, mode, startX: event.clientX, startY: event.clientY, initial: element, rect };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  movePointer(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag) return;
    const dx = ((event.clientX - drag.startX) / drag.rect.width) * 100;
    const dy = ((event.clientY - drag.startY) / drag.rect.height) * 100;
    const next = drag.mode === 'move'
      ? { ...drag.initial, x: this.clamp(drag.initial.x + dx, -100, 200), y: this.clamp(drag.initial.y + dy, -100, 200) }
      : { ...drag.initial, width: this.clamp(drag.initial.width + dx, .1, 200), height: this.clamp(drag.initial.height + dy, .1, 200) };
    this.preview.set(next);
  }

  endPointer(): void {
    const preview = this.preview();
    if (preview) this.replace(preview);
    this.preview.set(null);
    this.drag = undefined;
  }

  add(type: CanvasElementType): void {
    if (this.mode !== 'full') return;
    const id = `${type.toLowerCase()}-${Date.now()}`;
    const isPanel = type === 'NextStep';
    const element: CanvasElementDto = {
      id, type, x: 20, y: 20, width: 60, height: 18,
      zIndex: this.layout.elements.length + 1,
      style: type === 'Shape'
        ? { color: '#1d2a17' }
        : {
            color: '#ffffff', fontSize: 4, fontFamily: 'Georgia', textAlign: 'center', verticalAlign: 'center',
            ...(isPanel ? { backgroundColor: '#050706', borderColor: '#2d3a24', padding: 2 } : {}),
          },
      data: type === 'Text'
        ? { text: 'New text' }
        : type === 'NextStep'
          ? { label: 'NEXT STEP' }
          : type === 'SectionLabel'
            ? { prefix: 'CURRENT · ' }
            : {},
    };
    this.emit({ ...this.layout, elements: [...this.layout.elements, element] });
    this.select(id);
  }

  aspectRatio(): string { return `${this.layout.size.width} / ${this.layout.size.height}`; }

  resolutionLabel(): string {
    const { width, height } = this.layout.size;
    return `${width}x${height}`;
  }

  backgroundKind(): 'color' | 'gradient' | 'image' | 'video' {
    const kind = this.layout.background['kind'];
    return kind === 'gradient' || kind === 'image' || kind === 'video' ? kind : 'color';
  }

  backgroundColor(): string {
    const color = this.layout.background['color'];
    return typeof color === 'string' ? color : '#090b0f';
  }

  backgroundGradient(): string {
    const gradient = this.layout.background['gradient'];
    return typeof gradient === 'string' ? gradient : 'linear-gradient(135deg, #243316 0%, #050706 100%)';
  }

  backgroundUrl(): string {
    const url = this.layout.background['url'];
    return typeof url === 'string' ? url : '';
  }

  backgroundImage(): string | null {
    const kind = this.backgroundKind();
    if (kind === 'gradient') return this.backgroundGradient();
    if (kind === 'image' && this.backgroundUrl()) return `url("${this.backgroundUrl()}")`;
    return null;
  }

  backgroundVideo(): string | null {
    return this.backgroundKind() === 'video' && this.backgroundUrl() ? this.backgroundUrl() : null;
  }

  setBackgroundKind(value: string): void {
    if (this.mode !== 'full' || !['color', 'gradient', 'image', 'video'].includes(value)) return;
    const kind = value as 'color' | 'gradient' | 'image' | 'video';
    const color = this.backgroundColor();
    const background = kind === 'gradient'
      ? { kind, color, gradient: this.backgroundGradient() }
      : kind === 'image' || kind === 'video'
        ? { kind, color, url: this.backgroundUrl() }
        : { kind, color };
    this.emit({ ...this.layout, background });
  }

  updateBackground(field: 'color' | 'gradient' | 'url', value: string): void {
    if (this.mode !== 'full') return;
    this.emit({ ...this.layout, background: { ...this.layout.background, [field]: value } });
  }

  setResolution(value: string): void {
    if (this.mode !== 'full') return;
    const preset = {
      '1920x1080': { width: 1920, height: 1080, orientation: 'H' as const },
      '1080x1920': { width: 1080, height: 1920, orientation: 'V' as const },
      '3840x2160': { width: 3840, height: 2160, orientation: 'H' as const },
      '2160x3840': { width: 2160, height: 3840, orientation: 'V' as const },
      '1920x1200': { width: 1920, height: 1200, orientation: 'H' as const },
      '1200x1920': { width: 1200, height: 1920, orientation: 'V' as const },
    }[value];
    if (preset) this.emit({ ...this.layout, size: preset });
  }

  applyPreset(preset: 'center' | 'lowerThird' | 'fullWidth' | 'timerCorner'): void {
    if (this.mode !== 'full') return;
    const selected = this.selected();
    if (!selected) return;
    const next = preset === 'center'
      ? { ...selected, x: 10, y: 36, width: 80, height: 28, style: { ...selected.style, fontSize: 7, textAlign: 'center' } }
      : preset === 'lowerThird'
        ? { ...selected, x: 7, y: 74, width: 52, height: 15, style: { ...selected.style, fontSize: 4, textAlign: 'left' } }
        : preset === 'fullWidth'
          ? { ...selected, x: 5, y: 28, width: 90, height: 42, style: { ...selected.style, fontSize: 6, textAlign: 'center' } }
          : { ...selected, x: 74, y: 6, width: 20, height: 10, style: { ...selected.style, fontSize: 3, textAlign: 'right' } };
    this.replace(next);
  }

  removeSelected(): void {
    if (this.mode !== 'full') return;
    const id = this.selectedId();
    if (!id) return;
    this.emit({ ...this.layout, elements: this.layout.elements.filter((element) => element.id !== id) });
    this.selectedId.set(null);
  }

  updateNumber(field: 'x' | 'y' | 'width' | 'height', value: string): void {
    if (this.mode !== 'full') return;
    const selected = this.selected();
    const number = Number(value);
    if (!selected || !Number.isFinite(number)) return;
    this.replace({ ...selected, [field]: number });
  }

  updateText(value: string): void {
    if (this.mode !== 'full') return;
    const selected = this.selected();
    if (!selected) return;
    this.replace({ ...selected, data: { ...selected.data, text: value } });
  }

  updateUrl(value: string): void {
    if (this.mode !== 'full') return;
    const selected = this.selected();
    if (!selected) return;
    this.replace({ ...selected, data: { ...selected.data, url: value } });
  }

  updateData(field: string, value: string): void {
    if (this.mode !== 'full') return;
    const selected = this.selected();
    if (!selected) return;
    this.replace({ ...selected, data: { ...selected.data, [field]: value } });
  }

  lyricPaginationMode(): 'full' | 'steps' {
    return LyricPaginationSchema.safeParse(this.selected()?.data['lyricPagination']).success ? 'steps' : 'full';
  }

  lyricStepsPerSlide(): number {
    const value = this.selected()?.data['stepsPerSlide'];
    return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 1;
  }

  setLyricStepsPerSlide(value: string): void {
    if (this.mode !== 'full') return;
    const selected = this.selected();
    const stepsPerSlide = Number(value);
    if (!selected || selected.type !== 'Lyrics' || !Number.isInteger(stepsPerSlide) || stepsPerSlide < 1 || stepsPerSlide > 20) return;
    this.replace({ ...selected, data: { ...selected.data, stepsPerSlide } });
  }

  stepRule(field: 'maxLinesPerStep' | 'maxCharsPerLine' | 'minCharsPerStep'): number {
    const rules = this.selected()?.data['stepGenerator'];
    const value = rules && typeof rules === 'object' ? (rules as Record<string, unknown>)[field] : undefined;
    return typeof value === 'number' ? value : field === 'maxLinesPerStep' ? 2 : field === 'maxCharsPerLine' ? 42 : 12;
  }

  mergeShortLines(): boolean {
    const rules = this.selected()?.data['stepGenerator'];
    return !!(rules && typeof rules === 'object' && (rules as Record<string, unknown>)['mergeShortLines']);
  }

  setStepRule(field: string, value: number | boolean): void {
    if (this.mode !== 'full' || !this.stepGenerator) return;
    const selected = this.selected();
    if (!selected || selected.type !== 'Lyrics') return;
    const current = selected.data['stepGenerator'];
    const stepGenerator = {
      maxLinesPerStep: this.stepRule('maxLinesPerStep'),
      maxCharsPerLine: this.stepRule('maxCharsPerLine'),
      minCharsPerStep: this.stepRule('minCharsPerStep'),
      mergeShortLines: this.mergeShortLines(),
      ...(current && typeof current === 'object' ? current : {}),
      [field]: value,
    };
    this.replace({ ...selected, data: { ...selected.data, stepGenerator } });
  }

  lyricPages(): string {
    const parsed = LyricPaginationSchema.safeParse(this.selected()?.data['lyricPagination']);
    return parsed.success ? parsed.data.pages.map((page) => page.map((row) => row.join('+')).join(' / ')).join('\n') : '';
  }

  lyricStepMap(): string {
    const parsed = LyricPaginationSchema.safeParse(this.selected()?.data['lyricPagination']);
    if (!parsed.success) return '';
    return (parsed.data.stepMap ?? parsed.data.pages.map((_, index) => index + 1)).join(', ');
  }

  setLyricStepMap(value: string): void {
    if (this.mode === 'position') return;
    const selected = this.selected();
    const parsed = LyricPaginationSchema.safeParse(selected?.data['lyricPagination']);
    const stepMap = value.split(',').map((step) => Number(step.trim())).filter((step) => Number.isInteger(step) && step > 0);
    if (!selected || selected.type !== 'Lyrics' || !parsed.success || stepMap.length !== parsed.data.pages.length || new Set(stepMap).size !== stepMap.length) return;
    this.replace({ ...selected, data: { ...selected.data, lyricPagination: { ...parsed.data, stepMap }, lyricPaginationAutoFit: false } });
  }

  setLyricPagination(mode: string): void {
    if (this.mode === 'position') return;
    const selected = this.selected();
    if (!selected || selected.type !== 'Lyrics') return;
    const data = { ...selected.data };
    if (mode === 'steps') {
      data['lyricPaginationAutoFit'] = true;
      data['lyricPagination'] = { pages: this.automaticLyricPages(selected) };
    } else {
      delete data['lyricPagination'];
      delete data['lyricPaginationAutoFit'];
    }
    this.replace({ ...selected, data });
  }

  setLyricPages(value: string): void {
    if (this.mode === 'position') return;
    const selected = this.selected();
    if (!selected || selected.type !== 'Lyrics') return;
    const lineCount = this.lyricLines().length;
    const pages = value.split(/\r?\n/).map((page) => page.split('/').map((row) => [...new Set(row.split('+').map((part) => Number(part.trim())).filter((line) => Number.isInteger(line) && line > 0 && line <= lineCount))])).filter((page) => page.length && page.every((row) => row.length));
    const parsed = LyricPaginationSchema.safeParse({ pages });
    if (parsed.success) this.replace({ ...selected, data: { ...selected.data, lyricPagination: parsed.data, lyricPaginationAutoFit: false } });
  }

  splitLyricsEvery(value: string): void {
    if (this.mode === 'position') return;
    const every = Number(value);
    const selected = this.selected();
    if (!Number.isInteger(every) || every < 1 || !selected || selected.type !== 'Lyrics') return;
    const lines = this.lyricLines();
    const pages = lines.flatMap((_, index) => index % every === 0 ? [Array.from({ length: Math.min(every, lines.length - index) }, (_, offset) => [index + offset + 1])] : []);
    this.replace({ ...selected, data: { ...selected.data, lyricPagination: { pages }, lyricPaginationAutoFit: false } });
  }

  updateColor(value: string): void {
    if (this.mode !== 'full') return;
    const selected = this.selected();
    if (!selected) return;
    this.replace({ ...selected, style: { ...selected.style, color: value } });
  }

  updateStyle(field: string, value: string | number): void {
    if (this.mode !== 'full') return;
    const selected = this.selected();
    if (!selected || (typeof value === 'number' && !Number.isFinite(value))) return;
    this.replace({ ...selected, style: { ...selected.style, [field]: value } });
  }

  fontFamily(): string {
    const value = this.selected()?.style['fontFamily'];
    return typeof value === 'string' ? value : 'Georgia';
  }

  setFontFamily(value: string): void {
    if (!['Georgia', 'system-ui', 'Arial', 'ui-monospace'].includes(value)) return;
    this.updateStyle('fontFamily', value);
  }

  verticalAlign(): 'top' | 'center' | 'bottom' {
    const value = this.selected()?.style['verticalAlign'];
    return value === 'top' || value === 'bottom' ? value : 'center';
  }

  setVerticalAlign(value: string): void {
    if (value !== 'top' && value !== 'center' && value !== 'bottom') return;
    this.updateStyle('verticalAlign', value);
  }

  previewText(element: CanvasElementDto): string {
    const pagination = LyricPaginationSchema.safeParse(element.data['lyricPagination']);
    if ((element.type !== 'Lyrics' && element.type !== 'Scripture') || !pagination.success) return this.lyricPreview;
    const lines = this.lyricLines();
    return pagination.data.pages[0].map((row) => row.map((index) => lines[index - 1]).filter(Boolean).join(' ')).filter(Boolean).join('\n');
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

  mediaUrl(element: CanvasElementDto): string | null {
    const value = element.data['url'];
    return typeof value === 'string' && value.length ? value : null;
  }

  visibleLyricLineCapacity(): number {
    const selected = this.selected();
    return selected?.type === 'Lyrics' ? this.automaticLineCapacity(selected) : 0;
  }

  private replace(next: CanvasElementDto): void {
    if (next.type === 'Lyrics' && next.data['lyricPaginationAutoFit'] === true) {
      next = { ...next, data: { ...next.data, lyricPagination: { pages: this.automaticLyricPages(next) } } };
    }
    this.emit({ ...this.layout, elements: this.layout.elements.map((element) => element.id === next.id ? next : element) });
  }

  private lyricLines(): string[] { return this.lyricPreview.split(/\r?\n/).filter((line) => line.trim().length > 0); }
  private automaticLyricPages(element: CanvasElementDto): number[][][] {
    const lines = this.lyricLines();
    const capacity = this.automaticLineCapacity(element);
    const pages: number[][][] = [];
    let page: number[][] = [];
    let usedRows = 0;
    lines.forEach((line, index) => {
      const rows = this.estimatedVisualRows(line, element);
      if (page.length && usedRows + rows > capacity) {
        pages.push(page);
        page = [];
        usedRows = 0;
      }
      page.push([index + 1]);
      usedRows += rows;
    });
    if (page.length) pages.push(page);
    return pages;
  }

  private automaticLineCapacity(element: CanvasElementDto): number {
    const fontSize = typeof element.style['fontSize'] === 'number' ? element.style['fontSize'] : 4;
    return Math.max(1, Math.floor(element.height / Math.max(1, fontSize * 1.16)));
  }

  private estimatedVisualRows(line: string, element: CanvasElementDto): number {
    const fontSize = typeof element.style['fontSize'] === 'number' ? element.style['fontSize'] : 4;
    const canvasWidth = 100 * (this.layout.size.width / this.layout.size.height);
    const charactersPerRow = Math.max(8, Math.floor((canvasWidth * element.width / 100) / (fontSize * .55)));
    return Math.max(1, Math.ceil(line.trim().length / charactersPerRow));
  }

  private emit(value: CanvasLayoutDto): void {
    const parsed = CanvasLayoutSchema.safeParse(value);
    if (parsed.success) this.layoutChange.emit(parsed.data);
  }

  private clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)); }
}
