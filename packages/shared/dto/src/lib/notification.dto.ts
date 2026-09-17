import { z } from 'zod';
import {
  IdSchema,
  IsoDateTimeSchema,
  PaginationQuerySchema,
} from './common.dto';
import { DomainEventTypeSchema } from './event.dto';

export const NOTIFICATION_KINDS = [
  'ServiceCreated',
  'ServiceUpdated',
  'ServiceDeleted',
  'LineupChanged',
  'TeamAssignment',
  'SongChanged',
  'BibleChanged',
  'MediaChanged',
  'SlideChanged',
  'CountdownChanged',
  'ProgramControlRequest',
  'MemberAdded',
  'System',
] as const;
export const NotificationKindSchema = z.enum(NOTIFICATION_KINDS);
export type NotificationKind = z.infer<typeof NotificationKindSchema>;

export const NotificationDataSchema = z.object({
  subjectId: IdSchema.nullable(),
  eventType: DomainEventTypeSchema,
});
export type NotificationDataDto = z.infer<typeof NotificationDataSchema>;

export const NotificationSchema = z.object({
  id: IdSchema,
  organizationId: IdSchema,
  userId: IdSchema,
  eventId: IdSchema.nullable(),
  kind: NotificationKindSchema,
  title: z.string(),
  body: z.string(),
  data: NotificationDataSchema,
  readAt: IsoDateTimeSchema.nullable(),
  createdAt: IsoDateTimeSchema,
});
export type NotificationDto = z.infer<typeof NotificationSchema>;

export const NotificationListQuerySchema = PaginationQuerySchema.extend({
  organizationId: IdSchema,
  unreadOnly: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional()
    .default(false),
});
export type NotificationListQueryDto = z.infer<
  typeof NotificationListQuerySchema
>;

export const NotificationUnreadCountSchema = z.object({
  count: z.number().int().min(0),
});
export type NotificationUnreadCountDto = z.infer<
  typeof NotificationUnreadCountSchema
>;

export const NotificationPageSchema = z.object({
  items: z.array(NotificationSchema),
  page: z.object({ nextCursor: IdSchema.nullable() }),
});
export type NotificationPageDto = z.infer<typeof NotificationPageSchema>;
