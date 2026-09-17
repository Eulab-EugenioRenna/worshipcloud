import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { type LiveCueDto, type SlideTemplateDto } from '@worship/shared-dto';
import { AuthSessionStore } from '../../core/auth-session.store';
import { SlidesApiService } from '../../core/slides-api.service';
import { LiveCanvasComponent } from '../../shared/live-canvas/live-canvas';

@Component({
  selector: 'app-view-preview-page',
  imports: [RouterLink, LiveCanvasComponent],
  templateUrl: './view-preview.html',
  styleUrl: './view-preview.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewPreviewPage {
  readonly template = signal<SlideTemplateDto | null>(null);
  readonly failed = signal(false);
  readonly cue = computed<LiveCueDto | null>(() => {
    const template = this.template();
    if (!template) return null;
    return {
      lineupItemId: 'view-preview',
      type: template.kind === 'Song' ? 'Song' : template.kind === 'Bible' ? 'Bible' : template.kind === 'Countdown' ? 'Countdown' : template.kind === 'Clock' ? 'Clock' : 'Slide',
      title: template.name,
      sourceId: null,
      notes: null,
      sectionPosition: null,
      visualSlideId: null,
      visualStep: 0,
      lineupVisualSlideId: null,
      content: {
        slide: { content: { layout: template.layout } },
        song: { activeSection: { content: 'Line one\nLine two\nLine three' } },
        bible: {
          passageId: 'view-preview', reference: 'Giovanni 3:16', book: 'Giovanni', chapter: 3,
          translation: 'LND', sourceTranslation: 'LND', locale: 'it',
          verses: [{ verse: 16, text: 'Poiché Dio ha tanto amato il mondo, che ha dato il suo unigenito Figlio.' }],
        },
      },
    };
  });
  private readonly organizationId = inject(AuthSessionStore).session()?.memberships[0]?.organizationId;

  constructor(route: ActivatedRoute, slides: SlidesApiService) {
    const templateId = route.snapshot.paramMap.get('templateId');
    if (!this.organizationId || !templateId) { this.failed.set(true); return; }
    slides.listTemplates(this.organizationId).subscribe({
      next: (templates) => {
        const template = templates.find((item) => item.id === templateId) ?? null;
        this.template.set(template);
        this.failed.set(!template);
      },
      error: () => this.failed.set(true),
    });
  }
}
