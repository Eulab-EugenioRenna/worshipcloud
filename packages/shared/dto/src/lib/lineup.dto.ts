import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema, LanguageTagSchema } from './common.dto';
import { CanvasLayoutSchema, OutputTargetSchema, type TemplateKind } from './slide.dto';

export const LINEUP_ITEM_TYPES = [
  'Song',
  'Bible',
  'Slide',
  'Image',
  'Video',
  'Audio',
  'Countdown',
  'Clock',
  'Sermon',
  'Text',
  'Blank',
] as const;

export const LineupItemTypeSchema = z.enum(LINEUP_ITEM_TYPES);
export type LineupItemType = z.infer<typeof LineupItemTypeSchema>;

/** Settings layout kinds accepted by each cue type. */
export function templateKindsForLineupItem(type: LineupItemType): readonly TemplateKind[] {
  if (type === 'Song') return ['Song'];
  if (type === 'Bible') return ['Bible'];
  if (type === 'Countdown') return ['Countdown'];
  if (type === 'Clock') return ['Clock'];
  if (type === 'Sermon') return ['Sermon'];
  return ['Announcement', 'LowerThird'];
}

export const LineupItemSchema = z.object({
  id: IdSchema,
  serviceId: IdSchema,
  type: LineupItemTypeSchema,
  title: z.string(),
  position: z.number().int().min(0),
  sourceId: IdSchema.optional(),
  contentLocale: LanguageTagSchema.optional(),
  notes: z.string().optional(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type LineupItemDto = z.infer<typeof LineupItemSchema>;

export const LineupItemListSchema = z.array(LineupItemSchema);
export type LineupItemListDto = z.infer<typeof LineupItemListSchema>;

export const CreateLineupItemRequestSchema = z.object({
  type: LineupItemTypeSchema,
  title: z.string().trim().min(1).max(180),
  sourceId: IdSchema.optional(),
  contentLocale: LanguageTagSchema.optional(),
  notes: z.string().trim().max(5000).optional(),
});
export type CreateLineupItemRequestDto = z.infer<
  typeof CreateLineupItemRequestSchema
>;

export const UpdateLineupItemRequestSchema =
  CreateLineupItemRequestSchema.partial()
    .extend({
    sourceId: IdSchema.nullable().optional(),
    contentLocale: LanguageTagSchema.nullable().optional(),
      notes: z.string().trim().max(5000).nullable().optional(),
    })
    .refine((value) => Object.keys(value).length > 0, {
      message: 'At least one field is required',
    });
export type UpdateLineupItemRequestDto = z.infer<
  typeof UpdateLineupItemRequestSchema
>;

export const ReorderLineupRequestSchema = z.object({
  itemIds: z.array(IdSchema).min(1),
});
export type ReorderLineupRequestDto = z.infer<
  typeof ReorderLineupRequestSchema
>;

/** A view is attached to one cue and its cue type; it never duplicates the song, Bible or media source. */
export const LineupVisualSlideLayoutInputSchema = z.object({
  target: OutputTargetSchema,
  templateId: IdSchema.nullable().optional(),
  layout: CanvasLayoutSchema,
});
export type LineupVisualSlideLayoutInputDto = z.infer<typeof LineupVisualSlideLayoutInputSchema>;

export const LineupVisualSlideSchema = z.object({
  id: IdSchema,
  lineupItemId: IdSchema,
  name: z.string(),
  position: z.number().int().min(0),
  layouts: z.array(LineupVisualSlideLayoutInputSchema),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type LineupVisualSlideDto = z.infer<typeof LineupVisualSlideSchema>;

export const CreateLineupVisualSlideRequestSchema = z.object({
  name: z.string().trim().min(1).max(160),
  layouts: z.array(LineupVisualSlideLayoutInputSchema).min(1).max(4),
});
export type CreateLineupVisualSlideRequestDto = z.infer<typeof CreateLineupVisualSlideRequestSchema>;

export const UpdateLineupVisualSlideRequestSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  layouts: z.array(LineupVisualSlideLayoutInputSchema).min(1).max(4).optional(),
}).refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required' });
export type UpdateLineupVisualSlideRequestDto = z.infer<typeof UpdateLineupVisualSlideRequestSchema>;
