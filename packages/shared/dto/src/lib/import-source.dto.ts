import { z } from 'zod';

export const ImportSourceKindSchema = z.enum(['Bible', 'Song']);
export type ImportSourceKindDto = z.infer<typeof ImportSourceKindSchema>;

export const ImportSourceAdapterSchema = z.enum([
  'canonical-json',
  'getbible-v2',
]);
export type ImportSourceAdapterDto = z.infer<typeof ImportSourceAdapterSchema>;

/** Public metadata only. Provider URLs and credentials stay on the API server. */
export const ImportSourceSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(120),
  kind: ImportSourceKindSchema,
  adapter: ImportSourceAdapterSchema,
  description: z.string().max(300).optional(),
  requiresResource: z.boolean(),
});
export type ImportSourceDto = z.infer<typeof ImportSourceSchema>;

export const RemoteImportRequestSchema = z
  .object({
    sourceId: z.string().trim().min(1).max(80).optional(),
    resource: z.string().trim().min(1).max(500).optional(),
    url: z.string().url().max(2000).optional(),
  })
  .refine((value) => Boolean(value.sourceId) !== Boolean(value.url), {
    message: 'Choose either a configured source or a public URL',
  });
export type RemoteImportRequestDto = z.infer<typeof RemoteImportRequestSchema>;
