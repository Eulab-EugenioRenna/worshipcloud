import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EventBusService } from '../events/event-bus.service';
import { StructuredLogger } from '../common/structured-logger.service';
import { LiveService } from './live.service';

/** Keeps published output state aligned with edits to a live cue's scene. */
@Injectable()
export class LiveVisualSceneSynchronizerService implements OnModuleInit, OnModuleDestroy {
  private unsubscribe?: () => void;

  constructor(
    private readonly events: EventBusService,
    private readonly live: LiveService,
    private readonly logger: StructuredLogger,
  ) {}

  onModuleInit(): void {
    this.unsubscribe = this.events.subscribe(async (event) => {
      const sceneEvent = ['service.lineup-visual-slide.created', 'service.lineup-visual-slide.updated', 'service.lineup-visual-slide.deleted'].includes(event.type);
      const lineupItemEvent = ['service.lineup-item.updated', 'service.lineup-item.deleted'].includes(event.type);
      const sourceEvent = ['song.updated', 'song.translation.updated', 'song.translation.generated', 'song.visual-slide.created', 'song.visual-slide.updated', 'song.visual-slide.deleted', 'bible.passage-translation.generated', 'media.asset.updated', 'slide.document.updated', 'countdown.updated'].includes(event.type);
      const bibleImportEvent = event.type === 'bible.verses.imported';
      const templateEvent = event.type === 'slide.template.updated';
      if (!sceneEvent && !lineupItemEvent && !sourceEvent && !bibleImportEvent && !templateEvent) return;
      const serviceId = event.payload.serviceId;
      const sourceId = event.payload.sourceId ?? event.subjectId;
      if (!event.organizationId || !event.actorUserId || ((sceneEvent || lineupItemEvent) && !serviceId)) return;
      try {
        if (sceneEvent) await this.live.refreshVisualScenes(serviceId!, event.actorUserId, event.organizationId);
        else if (lineupItemEvent && event.subjectId) await this.live.refreshCueContentForLineupItem(serviceId!, event.subjectId, event.actorUserId, event.organizationId);
        else if (bibleImportEvent && event.subjectId) await this.live.refreshBibleTranslationContent(event.subjectId, event.actorUserId, event.organizationId);
        else if (templateEvent && event.subjectId) await this.live.refreshTemplateLayout(event.subjectId, event.actorUserId, event.organizationId);
        else if (sourceId) await this.live.refreshCueContentForSource(sourceId, event.actorUserId, event.organizationId);
      } catch (error) {
        this.logger.error(
          { event: 'live.visual-scene.sync-failed', serviceId: event.payload.serviceId, error: error instanceof Error ? error.message : String(error) },
          error instanceof Error ? error.stack : undefined,
          LiveVisualSceneSynchronizerService.name,
        );
      }
    });
  }

  onModuleDestroy(): void { this.unsubscribe?.(); }
}
