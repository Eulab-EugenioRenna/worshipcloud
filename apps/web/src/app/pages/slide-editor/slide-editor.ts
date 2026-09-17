import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { CanvasLayoutDto, SlideBlockDto, SlideContentDto, SlideDocumentDto } from '@worship/shared-dto';
import { AuthSessionStore } from '../../core/auth-session.store';
import { SlidesApiService } from '../../core/slides-api.service';
import { CanvasEditorComponent } from '../../shared/canvas-editor/canvas-editor';

@Component({
  selector: 'app-slide-editor-page',
  imports: [RouterLink, CanvasEditorComponent],
  templateUrl: './slide-editor.html',
  styleUrl: './slide-editor.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SlideEditorPage {
  readonly slide = signal<SlideDocumentDto | null>(null);
  readonly name = signal('');
  readonly layout = signal<CanvasLayoutDto>(this.defaultLayout());
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  private readonly organizationId = inject(AuthSessionStore).session()?.memberships[0]?.organizationId;
  private readonly slideId = inject(ActivatedRoute).snapshot.paramMap.get('slideId');

  constructor(
    private readonly slides: SlidesApiService,
  ) {
    if (this.organizationId && this.slideId) {
      this.slides.get(this.organizationId, this.slideId).subscribe({
        next: (slide) => {
          this.slide.set(slide);
          this.name.set(slide.name);
          this.layout.set(slide.content.layout ?? this.defaultLayout(slide));
        },
        error: () => this.error.set('This slide could not be loaded.'),
      });
    }
  }

  save(): void {
    const slide = this.slide();
    if (!this.organizationId || !slide || !this.name().trim() || this.saving()) return;
    const layout = this.layout();
    this.saving.set(true);
    this.error.set(null);
    this.slides.update(this.organizationId, slide.id, {
      name: this.name().trim(),
      content: this.contentFor(slide.content, layout),
    }).subscribe({
      next: (updated) => { this.slide.set(updated); this.name.set(updated.name); this.saving.set(false); },
      error: () => { this.error.set('The slide could not be saved.'); this.saving.set(false); },
    });
  }

  private contentFor(current: SlideContentDto, layout: CanvasLayoutDto): SlideContentDto {
    const textBlocks: SlideBlockDto[] = layout.elements.flatMap((element) =>
      element.type === 'Text' && typeof element.data['text'] === 'string'
        ? [{ id: element.id, type: 'Text', data: { text: element.data['text'] } }]
        : [],
    );
    const textById = new Map(textBlocks.map((block) => [block.id, block]));
    const blocks: SlideBlockDto[] = current.blocks.map((block) => textById.get(block.id) ?? block);
    for (const block of textBlocks) {
      if (!current.blocks.some((existing) => existing.id === block.id)) blocks.push(block);
    }
    return { ...current, blocks, layout };
  }

  private defaultLayout(slide?: SlideDocumentDto): CanvasLayoutDto {
    const textBlock = slide?.content.blocks.find((block) => block.type === 'Text');
    const text = textBlock?.data['text'];
    return {
      version: 1,
      size: { width: 1920, height: 1080, orientation: 'H' },
      background: { color: '#090b0f' },
      elements: [{
        id: textBlock?.id ?? 'slide-text', type: 'Text', x: 10, y: 36, width: 80, height: 28, zIndex: 1,
        style: { color: '#ffffff', fontSize: 7, fontFamily: 'Georgia', textAlign: 'center' },
        data: { text: typeof text === 'string' ? text : 'New slide' },
      }],
    };
  }
}
