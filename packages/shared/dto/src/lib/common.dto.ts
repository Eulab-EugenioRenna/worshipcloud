import { z } from 'zod';

export const IdSchema = z.string().trim().min(1).max(128);
/** BCP 47 language tag. `und` is used only when the source language is unknown. */
export const LanguageTagSchema = z
  .string()
  .trim()
  .regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*|und$/, 'Expected a BCP 47 language tag')
  .max(35);
export type LanguageTagDto = z.infer<typeof LanguageTagSchema>;
export const IsoDateTimeSchema = z.string().datetime({ offset: true });
export const DateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected an ISO date (YYYY-MM-DD)')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(date.valueOf()) && date.toISOString().startsWith(value)
    );
  }, 'Expected a valid calendar date');
export const TimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected a 24-hour time (HH:mm)');

export const PaginationQuerySchema = z.object({
  cursor: IdSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export type PaginationQueryDto = z.infer<typeof PaginationQuerySchema>;

export const PageMetaSchema = z.object({
  nextCursor: IdSchema.nullable(),
});

export type PageMetaDto = z.infer<typeof PageMetaSchema>;

export interface PageDto<TItem> {
  readonly items: readonly TItem[];
  readonly page: PageMetaDto;
}

export const ApiErrorCodeSchema = z.enum([
  'BAD_REQUEST',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'VALIDATION_FAILED',
  'INTERNAL_ERROR',
]);

export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

export const ApiErrorSchema = z.object({
  statusCode: z.number().int().min(400).max(599),
  code: ApiErrorCodeSchema,
  message: z.string(),
  requestId: z.string(),
  details: z.unknown().optional(),
  timestamp: IsoDateTimeSchema,
});

export type ApiErrorDto = z.infer<typeof ApiErrorSchema>;

export const MessageResponseSchema = z.object({ message: z.string() });
export type MessageResponseDto = z.infer<typeof MessageResponseSchema>;

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export const LogLevelSchema = z.enum(LOG_LEVELS);
export type LogLevel = z.infer<typeof LogLevelSchema>;

export const LogEntrySchema = z.object({
  timestamp: IsoDateTimeSchema,
  level: LogLevelSchema,
  context: z.string(),
  event: z.string(),
  message: z.string().optional(),
  requestId: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});
export type LogEntryDto = z.infer<typeof LogEntrySchema>;
