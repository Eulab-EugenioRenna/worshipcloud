import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema, LanguageTagSchema } from './common.dto';
import { RemoteImportRequestSchema } from './import-source.dto';
import { CanvasLayoutSchema, OutputTargetSchema } from './slide.dto';

export const SONG_SECTION_TYPES = [
  'Intro',
  'Verse',
  'Pre-Chorus',
  'Chorus',
  'Bridge',
  'Tag',
  'Ending',
] as const;
export const SongSectionTypeSchema = z.enum(SONG_SECTION_TYPES);
export type SongSectionType = z.infer<typeof SongSectionTypeSchema>;

export const SongSectionInputSchema = z.object({
  type: SongSectionTypeSchema,
  label: z.string().trim().min(1).max(80),
  content: z.string().trim().min(1).max(20000),
});
export type SongSectionInputDto = z.infer<typeof SongSectionInputSchema>;

/** Existing source sections retain their identity so visual slides keep their source reference. */
export const UpdateSongSectionInputSchema = SongSectionInputSchema.extend({
  id: IdSchema.optional(),
});
export type UpdateSongSectionInputDto = z.infer<
  typeof UpdateSongSectionInputSchema
>;

export const SongStepGenerationRulesSchema = z.object({
  maxLinesPerStep: z.number().int().min(1).max(8),
  maxCharsPerLine: z.number().int().min(10).max(160),
  minCharsPerStep: z.number().int().min(1).max(80),
  mergeShortLines: z.boolean(),
});
export type SongStepGenerationRulesDto = z.infer<
  typeof SongStepGenerationRulesSchema
>;

export const DEFAULT_SONG_STEP_GENERATION_RULES: SongStepGenerationRulesDto = {
  maxLinesPerStep: 2,
  maxCharsPerLine: 42,
  minCharsPerStep: 12,
  mergeShortLines: false,
};

export const ReplaceSongSectionStepsRequestSchema = z.object({
  steps: z.array(z.string().trim().min(1).max(2000)).min(1).max(500),
});
export type ReplaceSongSectionStepsRequestDto = z.infer<
  typeof ReplaceSongSectionStepsRequestSchema
>;

export const GeneratedSongStepSchema = z.object({
  position: z.number().int().min(0),
  content: z.string().min(1),
  lines: z.array(z.string().min(1)).min(1).max(8),
  lineStart: z.number().int().positive(),
  lineEnd: z.number().int().positive(),
});
export type GeneratedSongStepDto = z.infer<typeof GeneratedSongStepSchema>;

/** Canonical section steps are generated before any output layout pagination. */
export function generateSongSectionSteps(
  content: string,
  rules: SongStepGenerationRulesDto = DEFAULT_SONG_STEP_GENERATION_RULES,
): GeneratedSongStepDto[] {
  const sourceLines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const wrappedLines: {
    content: string;
    lineStart: number;
    lineEnd: number;
  }[] = [];
  sourceLines.forEach((line, index) => {
    const words = line.split(/\s+/).filter(Boolean);
    const chunks: string[] = [];
    while (words.length) {
      const chunkWords = [words.shift()!];
      while (
        words.length &&
        [...chunkWords, words[0]].join(' ').length <= rules.maxCharsPerLine
      ) {
        chunkWords.push(words.shift()!);
      }
      // Do not leave a one-word/tiny orphan after an otherwise valid line.
      while (
        words.length &&
        words.join(' ').length < rules.minCharsPerStep &&
        chunkWords.length > 1
      ) {
        words.unshift(chunkWords.pop()!);
      }
      chunks.push(chunkWords.join(' '));
    }
    chunks.forEach((chunk) =>
      wrappedLines.push({ content: chunk, lineStart: index + 1, lineEnd: index + 1 }),
    );
  });
  const displayLines: typeof wrappedLines = [];
  wrappedLines.forEach((line) => {
    const previous = displayLines.at(-1);
    const joined = previous ? `${previous.content} ${line.content}` : line.content;
    if (
      rules.mergeShortLines &&
      previous &&
      joined.length <= rules.maxCharsPerLine
    ) {
      previous.content = joined;
      previous.lineEnd = line.lineEnd;
      return;
    }
    displayLines.push({ ...line });
  });
  const steps: GeneratedSongStepDto[] = [];
  for (let index = 0; index < displayLines.length; ) {
    let slice = displayLines.slice(index, index + rules.maxLinesPerStep);
    const remaining = displayLines.length - (index + slice.length);
    if (
      remaining > 0 &&
      remaining < rules.maxLinesPerStep &&
      displayLines
        .slice(index + slice.length)
        .map((line) => line.content)
        .join(' ').length < rules.minCharsPerStep &&
      slice.length > 1
    ) {
      slice = slice.slice(0, -1);
    }
    steps.push({
      position: steps.length,
      content: slice.map((line) => line.content).join('\n'),
      lines: slice.map((line) => line.content),
      lineStart: slice[0].lineStart,
      lineEnd: slice.at(-1)!.lineEnd,
    });
    index += slice.length;
  }
  return steps;
}

export const SongStepSchema = GeneratedSongStepSchema.extend({
  id: IdSchema,
  sectionId: IdSchema,
});
export type SongStepDto = z.infer<typeof SongStepSchema>;

export const SongSectionSchema = SongSectionInputSchema.extend({
  id: IdSchema,
  position: z.number().int().min(0),
  steps: z.array(SongStepSchema),
});
export type SongSectionDto = z.infer<typeof SongSectionSchema>;

export const SongTranslationSectionSchema = SongSectionInputSchema.extend({
  id: IdSchema,
  position: z.number().int().min(0),
});
export type SongTranslationSectionDto = z.infer<
  typeof SongTranslationSectionSchema
>;

export const SongTranslationInputSchema = z.object({
  locale: LanguageTagSchema,
  title: z.string().trim().min(1).max(180),
  sections: z.array(SongSectionInputSchema).min(1).max(200),
});
export type SongTranslationInputDto = z.infer<
  typeof SongTranslationInputSchema
>;

export const SongTranslationSchema = SongTranslationInputSchema.extend({
  id: IdSchema,
  songId: IdSchema,
  sections: z.array(SongTranslationSectionSchema),
  generatedAt: IsoDateTimeSchema.nullable(),
  reviewedAt: IsoDateTimeSchema.nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type SongTranslationDto = z.infer<typeof SongTranslationSchema>;

export const SongVisualSlideLayoutInputSchema = z.object({
  target: OutputTargetSchema,
  templateId: IdSchema.nullable().optional(),
  /** Overrides copied or authored in the canvas for this exact output. */
  layout: CanvasLayoutSchema.optional(),
});
export type SongVisualSlideLayoutInputDto = z.infer<
  typeof SongVisualSlideLayoutInputSchema
>;

export const SongVisualSlideLayoutSchema =
  SongVisualSlideLayoutInputSchema.extend({
    id: IdSchema,
    songVisualSlideId: IdSchema,
    layout: CanvasLayoutSchema,
  });
export type SongVisualSlideLayoutDto = z.infer<
  typeof SongVisualSlideLayoutSchema
>;

export const SongVisualSlideInputSchema = z.object({
  sectionId: IdSchema,
  name: z.string().trim().min(1).max(180),
  layouts: z
    .array(SongVisualSlideLayoutInputSchema)
    .min(1)
    .max(4)
    .superRefine((layouts, context) => {
      const seen = new Set<string>();
      for (const [index, layout] of layouts.entries()) {
        if (seen.has(layout.target))
          context.addIssue({
            code: 'custom',
            path: [index, 'target'],
            message: 'Each output target can have only one layout',
          });
        seen.add(layout.target);
      }
    }),
});
export type SongVisualSlideInputDto = z.infer<
  typeof SongVisualSlideInputSchema
>;

export const UpdateSongVisualSlideRequestSchema =
  SongVisualSlideInputSchema.partial().refine(
    (value) => Object.keys(value).length > 0,
    { message: 'At least one field is required' },
  );
export type UpdateSongVisualSlideRequestDto = z.infer<
  typeof UpdateSongVisualSlideRequestSchema
>;

export const SongVisualSlideSchema = SongVisualSlideInputSchema.extend({
  id: IdSchema,
  songId: IdSchema,
  position: z.number().int().min(0),
  layouts: z.array(SongVisualSlideLayoutSchema),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type SongVisualSlideDto = z.infer<typeof SongVisualSlideSchema>;

export const GenerateSongTranslationRequestSchema = z.object({
  targetLocale: LanguageTagSchema,
});
export type GenerateSongTranslationRequestDto = z.infer<
  typeof GenerateSongTranslationRequestSchema
>;

export const SongArrangementInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  sectionIds: z.array(IdSchema),
});
export type SongArrangementInputDto = z.infer<
  typeof SongArrangementInputSchema
>;

export const SongArrangementSchema = SongArrangementInputSchema.extend({
  id: IdSchema,
});
export type SongArrangementDto = z.infer<typeof SongArrangementSchema>;

export const ReplaceSongArrangementsRequestSchema = z.object({
  arrangements: z.array(SongArrangementInputSchema),
});
export type ReplaceSongArrangementsRequestDto = z.infer<
  typeof ReplaceSongArrangementsRequestSchema
>;

export const CreateSongRequestSchema = z.object({
  // `und` is valid only for imported songs whose language is genuinely unknown.
  // A manually created song must always declare its source language.
  locale: LanguageTagSchema,
  title: z.string().trim().min(1).max(180),
  author: z.string().trim().max(180).optional(),
  copyright: z.string().trim().max(500).optional(),
  ccli: z.string().trim().max(80).optional(),
  key: z.string().trim().max(16).optional(),
  bpm: z.number().int().min(20).max(400).optional(),
  sections: z.array(SongSectionInputSchema).max(200).default([]),
});
export type CreateSongRequestDto = z.infer<typeof CreateSongRequestSchema>;

export const ImportSongsRequestSchema = z.object({
  songs: z.array(CreateSongRequestSchema).min(1).max(500),
});
export type ImportSongsRequestDto = z.infer<typeof ImportSongsRequestSchema>;

/** Direct JSON uploads and remote providers share one backwards-compatible route. */
export const SongImportCommandSchema = z.union([
  ImportSongsRequestSchema,
  RemoteImportRequestSchema,
]);
export type SongImportCommandDto = z.infer<typeof SongImportCommandSchema>;

export const UpdateSongRequestSchema = CreateSongRequestSchema.partial()
  .extend({
    sections: z.array(UpdateSongSectionInputSchema).max(200).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });
export type UpdateSongRequestDto = z.infer<typeof UpdateSongRequestSchema>;

export const SongSchema = CreateSongRequestSchema.omit({
  sections: true,
}).extend({
  id: IdSchema,
  organizationId: IdSchema,
  sections: z.array(SongSectionSchema),
  arrangements: z.array(SongArrangementSchema),
  translations: z.array(SongTranslationSchema).default([]),
  visualSlides: z.array(SongVisualSlideSchema).default([]),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type SongDto = z.infer<typeof SongSchema>;

export const ImportSongsResponseSchema = z.object({
  imported: z.number().int().min(1),
  songs: z.array(SongSchema),
});
export type ImportSongsResponseDto = z.infer<typeof ImportSongsResponseSchema>;

export const SongListQuerySchema = z.object({
  search: z.string().trim().max(180).optional(),
});
export type SongListQueryDto = z.infer<typeof SongListQuerySchema>;
