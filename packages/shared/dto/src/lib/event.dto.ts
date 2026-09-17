import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema } from './common.dto';
import { LiveStateSchema } from './live.dto';

export const DOMAIN_EVENT_TYPES = [
  'auth.user.registered',
  'auth.user.logged-in',
  'auth.user.logged-out',
  'organization.location.created',
  'organization.location.updated',
  'organization.location.deleted',
  'organization.member.roles-updated',
  'organization.member.added',
  'live.session.prepared',
  'live.session.started',
  'live.session.ended',
  'live.state.updated',
  'bible.translation.created',
  'bible.verses.imported',
  'bible.passage.created',
  'bible.passage-translation.generated',
  'media.asset.created',
  'media.asset.updated',
  'media.asset.deleted',
  'slide.template.created',
  'slide.template.updated',
  'slide.template.deleted',
  'slide.document.created',
  'slide.document.updated',
  'slide.document.deleted',
  'countdown.created',
  'countdown.updated',
  'countdown.deleted',
  'live.program-control.requested',
  'live.program-control.approved',
  'live.program-control.rejected',
  'service.created',
  'service.updated',
  'service.deleted',
  'service.lineup-item.created',
  'service.lineup-item.duplicated',
  'service.lineup-item.updated',
  'service.lineup-item.deleted',
  'service.lineup.reordered',
  'service.lineup-visual-slide.created',
  'service.lineup-visual-slide.updated',
  'service.lineup-visual-slide.deleted',
  'service.team-assignment.created',
  'service.team-assignment.updated',
  'service.team-assignment.removed',
  'song.created',
  'song.updated',
  'song.deleted',
  'song.translation.updated',
  'song.translation.generated',
  'song.visual-slide.created',
  'song.visual-slide.updated',
  'song.visual-slide.deleted',
  'notification.created',
] as const;

export const DomainEventTypeSchema = z.enum(DOMAIN_EVENT_TYPES);
export type DomainEventType = z.infer<typeof DomainEventTypeSchema>;

export const DomainEventPayloadSchema = z
  .object({
    email: z.string().email().optional(),
    title: z.string().optional(),
    serviceId: IdSchema.optional(),
    serviceTitle: z.string().optional(),
    sourceId: IdSchema.optional(),
    targetUserId: IdSchema.optional(),
    sessionId: IdSchema.optional(),
    liveState: LiveStateSchema.optional(),
  })
  .strict();
export type DomainEventPayloadDto = z.infer<typeof DomainEventPayloadSchema>;

export const DomainEventSchema = z.object({
  id: IdSchema,
  type: DomainEventTypeSchema,
  organizationId: IdSchema.nullable(),
  actorUserId: IdSchema.nullable(),
  subjectId: IdSchema.nullable(),
  payload: DomainEventPayloadSchema,
  correlationId: z.string(),
  occurredAt: IsoDateTimeSchema,
});
export type DomainEventDto = z.infer<typeof DomainEventSchema>;

export const PublishDomainEventSchema = DomainEventSchema.omit({
  id: true,
  occurredAt: true,
});
export type PublishDomainEventDto = z.infer<typeof PublishDomainEventSchema>;

export const EventStreamQuerySchema = z.object({
  organizationId: IdSchema,
  after: IsoDateTimeSchema.optional(),
  /** Tie-breaker for events written in the same timestamp tick. */
  afterId: IdSchema.optional(),
});
export type EventStreamQueryDto = z.infer<typeof EventStreamQuerySchema>;
