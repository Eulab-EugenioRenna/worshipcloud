import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema } from './common.dto';

export const MEDIA_ASSET_KINDS = [
  'Image',
  'Video',
  'Audio',
  'MotionBackground',
  'Logo',
  'CountdownVideo',
] as const;
export const MediaAssetKindSchema = z.enum(MEDIA_ASSET_KINDS);
export type MediaAssetKind = z.infer<typeof MediaAssetKindSchema>;

const AssetUrlSchema = z.string().url().max(2048);

export const CreateMediaAssetRequestSchema = z.object({
  name: z.string().trim().min(1).max(180),
  kind: MediaAssetKindSchema,
  url: AssetUrlSchema,
  thumbnailUrl: AssetUrlSchema.optional(),
  durationMs: z.number().int().min(0).max(86_400_000).optional(),
  width: z.number().int().min(1).max(32_768).optional(),
  height: z.number().int().min(1).max(32_768).optional(),
  category: z.string().trim().min(1).max(80).optional(),
  tags: z.array(z.string().trim().min(1).max(48)).max(30).default([]),
});
export type CreateMediaAssetRequestDto = z.infer<
  typeof CreateMediaAssetRequestSchema
>;

export const UpdateMediaAssetRequestSchema =
  CreateMediaAssetRequestSchema.partial().refine(
    (value) => Object.keys(value).length > 0,
    { message: 'At least one field is required' },
  );
export type UpdateMediaAssetRequestDto = z.infer<
  typeof UpdateMediaAssetRequestSchema
>;

export const MediaAssetSchema = CreateMediaAssetRequestSchema.extend({
  id: IdSchema,
  organizationId: IdSchema,
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type MediaAssetDto = z.infer<typeof MediaAssetSchema>;

export const MediaAssetListQuerySchema = z.object({
  kind: MediaAssetKindSchema.optional(),
  search: z.string().trim().max(180).optional(),
  tag: z.string().trim().max(48).optional(),
});
export type MediaAssetListQueryDto = z.infer<typeof MediaAssetListQuerySchema>;
