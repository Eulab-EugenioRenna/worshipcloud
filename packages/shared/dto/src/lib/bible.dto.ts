import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema, LanguageTagSchema } from './common.dto';
import { RemoteImportRequestSchema } from './import-source.dto';

export const BibleTranslationSchema = z.object({
  id: IdSchema,
  organizationId: IdSchema,
  locale: LanguageTagSchema,
  name: z.string().min(1).max(160),
  abbreviation: z.string().min(1).max(32),
  copyright: z.string().max(500).optional(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type BibleTranslationDto = z.infer<typeof BibleTranslationSchema>;

export const CreateBibleTranslationRequestSchema = z.object({
  locale: LanguageTagSchema.default('und'),
  name: z.string().trim().min(2).max(160),
  abbreviation: z.string().trim().min(2).max(32),
  copyright: z.string().trim().max(500).optional(),
});
export type CreateBibleTranslationRequestDto = z.infer<
  typeof CreateBibleTranslationRequestSchema
>;

export const BibleVerseInputSchema = z.object({
  book: z.string().trim().min(1).max(80),
  bookOrder: z.number().int().min(1).max(100),
  chapter: z.number().int().min(1).max(200),
  verse: z.number().int().min(1).max(300),
  text: z.string().trim().min(1).max(20000),
});
export type BibleVerseInputDto = z.infer<typeof BibleVerseInputSchema>;

export const ImportBibleVersesRequestSchema = z.object({
  verses: z.array(BibleVerseInputSchema).min(1).max(5000),
});
export type ImportBibleVersesRequestDto = z.infer<
  typeof ImportBibleVersesRequestSchema
>;

export const ImportBibleRequestSchema = z.object({
  translation: CreateBibleTranslationRequestSchema,
  verses: z
    .array(BibleVerseInputSchema)
    .min(1)
    .max(50000)
    .superRefine((verses, context) => {
      const coordinates = new Set<string>();
      verses.forEach((verse, index) => {
        const coordinate = `${verse.book}\u0000${verse.chapter}\u0000${verse.verse}`;
        if (coordinates.has(coordinate)) {
          context.addIssue({
            code: 'custom',
            path: [index],
            message: 'Bible verse coordinates must be unique within an import',
          });
        }
        coordinates.add(coordinate);
      });
    }),
});
export type ImportBibleRequestDto = z.infer<typeof ImportBibleRequestSchema>;

/** Direct JSON uploads and remote providers share one backwards-compatible route. */
export const BibleImportCommandSchema = z.union([
  ImportBibleRequestSchema,
  RemoteImportRequestSchema,
]);
export type BibleImportCommandDto = z.infer<typeof BibleImportCommandSchema>;

export const ImportBibleResponseSchema = z.object({
  translation: BibleTranslationSchema,
  importedVerses: z.number().int().min(1),
});
export type ImportBibleResponseDto = z.infer<typeof ImportBibleResponseSchema>;

export const BibleVerseSchema = BibleVerseInputSchema.extend({ id: IdSchema });
export type BibleVerseDto = z.infer<typeof BibleVerseSchema>;

export const BibleSearchQuerySchema = z.object({
  translationId: IdSchema,
  query: z.string().trim().min(2).max(160),
});
export type BibleSearchQueryDto = z.infer<typeof BibleSearchQuerySchema>;

export const BibleBooksQuerySchema = z.object({ translationId: IdSchema });
export type BibleBooksQueryDto = z.infer<typeof BibleBooksQuerySchema>;

export const BibleChaptersQuerySchema = BibleBooksQuerySchema.extend({
  book: z.string().trim().min(1).max(80),
});
export type BibleChaptersQueryDto = z.infer<typeof BibleChaptersQuerySchema>;

export const BibleVersesQuerySchema = BibleChaptersQuerySchema.extend({
  chapter: z.coerce.number().int().min(1).max(200),
});
export type BibleVersesQueryDto = z.infer<typeof BibleVersesQuerySchema>;

export const BiblePassageSchema = z.object({
  id: IdSchema,
  organizationId: IdSchema,
  translationId: IdSchema,
  translationAbbreviation: z.string(),
  book: z.string(),
  chapter: z.number().int(),
  verseStart: z.number().int(),
  verseEnd: z.number().int(),
  reference: z.string(),
  verses: z.array(BibleVerseSchema),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type BiblePassageDto = z.infer<typeof BiblePassageSchema>;

export const BiblePassageTranslationVerseSchema = z.object({
  verse: z.number().int().min(1).max(300),
  text: z.string().trim().min(1).max(20000),
});
export type BiblePassageTranslationVerseDto = z.infer<
  typeof BiblePassageTranslationVerseSchema
>;

export const BiblePassageTranslationSchema = z.object({
  id: IdSchema,
  passageId: IdSchema,
  locale: LanguageTagSchema,
  verses: z.array(BiblePassageTranslationVerseSchema).min(1),
  generatedAt: IsoDateTimeSchema,
  provider: z.string().min(1).max(120),
  model: z.string().min(1).max(180),
});
export type BiblePassageTranslationDto = z.infer<
  typeof BiblePassageTranslationSchema
>;

export const GenerateBiblePassageTranslationRequestSchema = z.object({
  targetLocale: LanguageTagSchema,
});
export type GenerateBiblePassageTranslationRequestDto = z.infer<
  typeof GenerateBiblePassageTranslationRequestSchema
>;

export const CreateBiblePassageRequestSchema = z
  .object({
    translationId: IdSchema,
    book: z.string().trim().min(1).max(80),
    chapter: z.number().int().min(1).max(200),
    verseStart: z.number().int().min(1).max(300).optional(),
    verseEnd: z.number().int().min(1).max(300).optional(),
  })
  .refine(
    (value) =>
      (value.verseStart === undefined) === (value.verseEnd === undefined),
    {
      path: ['verseEnd'],
      message: 'verseStart and verseEnd must be provided together',
    },
  )
  .refine(
    (value) =>
      value.verseStart === undefined || value.verseEnd! >= value.verseStart,
    {
      path: ['verseEnd'],
      message: 'verseEnd must not precede verseStart',
    },
  );
export type CreateBiblePassageRequestDto = z.infer<
  typeof CreateBiblePassageRequestSchema
>;
