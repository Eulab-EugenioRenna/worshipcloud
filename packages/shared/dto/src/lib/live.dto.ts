import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema } from './common.dto';
import { LineupItemTypeSchema } from './lineup.dto';
import { LiveCountdownStateSchema } from './countdown.dto';
import { OutputTargetSchema } from './slide.dto';

export const LIVE_SESSION_STATUSES = [
  'Preparing',
  'Ready',
  'Live',
  'Ended',
] as const;
export const LiveSessionStatusSchema = z.enum(LIVE_SESSION_STATUSES);
export type LiveSessionStatus = z.infer<typeof LiveSessionStatusSchema>;

/** Bible content carried by a live cue. Keep verse references explicit so every output renders the same citation. */
export const LiveBibleVerseSchema = z.object({
  verse: z.number().int().min(1),
  text: z.string(),
});
export type LiveBibleVerseDto = z.infer<typeof LiveBibleVerseSchema>;

export const LiveBibleContentSchema = z.object({
  passageId: IdSchema,
  reference: z.string(),
  book: z.string(),
  chapter: z.number().int().min(1),
  translation: z.string(),
  sourceTranslation: z.string(),
  locale: z.string(),
  verses: z.array(LiveBibleVerseSchema),
});
export type LiveBibleContentDto = z.infer<typeof LiveBibleContentSchema>;

export function liveBibleVerseReference(
  bible: Pick<LiveBibleContentDto, 'book' | 'chapter' | 'sourceTranslation'>,
  verse: Pick<LiveBibleVerseDto, 'verse'>,
): string {
  return `${bible.book} ${bible.chapter}:${verse.verse} (${bible.sourceTranslation})`;
}

/** Bible cues carry a passage, while visualStep selects exactly one verse. */
export function liveBibleVerseAtStep(
  bible: Pick<LiveBibleContentDto, 'verses'>,
  visualStep: number,
): LiveBibleVerseDto | null {
  return bible.verses[visualStep] ?? null;
}

export const LIVE_ACTIONS = [
  'Preview',
  'Take',
  'Previous',
  'Next',
  'Clear',
  'Blackout',
  'Unblackout',
  'ClaimProgram',
  'ReleaseProgram',
  'End',
  'StartCountdown',
  'PauseCountdown',
  'ResumeCountdown',
  'ResetCountdown',
  'SendMessage',
  'RequestProgramControl',
  'AcceptProgramControl',
  'RejectProgramControl',
] as const;
export const LiveActionSchema = z.enum(LIVE_ACTIONS);
export type LiveAction = z.infer<typeof LiveActionSchema>;

export const LiveCueSchema = z.object({
  lineupItemId: IdSchema,
  type: LineupItemTypeSchema,
  title: z.string(),
  sourceId: IdSchema.nullable(),
  notes: z.string().nullable(),
  /** Selected song section. Null means the cue is rendered as a whole. */
  sectionPosition: z.number().int().min(0).nullable().default(null),
  visualSlideId: IdSchema.nullable().default(null),
  /** Zero-based page for the active song visual slide. */
  visualStep: z.number().int().min(0).default(0),
  lineupVisualSlideId: IdSchema.nullable().default(null),
  content: z.record(z.string(), z.unknown()),
});
export type LiveCueDto = z.infer<typeof LiveCueSchema>;

export const LiveStateSchema = z.object({
  sessionId: IdSchema,
  serviceId: IdSchema,
  preview: LiveCueSchema.nullable(),
  program: LiveCueSchema.nullable(),
  programOwnerId: IdSchema.nullable(),
  programControlRequest: z
    .object({ userId: IdSchema, requestedAt: IsoDateTimeSchema })
    .nullable(),
  blackout: z.boolean(),
  countdown: LiveCountdownStateSchema.nullable(),
  operatorMessage: z
    .object({ body: z.string().min(1).max(1000), sentAt: IsoDateTimeSchema })
    .nullable(),
  version: z.number().int().min(0),
  updatedAt: IsoDateTimeSchema,
});
export type LiveStateDto = z.infer<typeof LiveStateSchema>;

export const LiveOutputUrlsSchema = z.object({
  control: z.string().url(),
  preview: z.string().url(),
  main: z.string().url(),
  stage: z.string().url(),
  prompter: z.string().url(),
  alpha: z.string().url(),
});
export type LiveOutputUrlsDto = z.infer<typeof LiveOutputUrlsSchema>;

export const LiveSessionSchema = z.object({
  id: IdSchema,
  serviceId: IdSchema,
  status: LiveSessionStatusSchema,
  state: LiveStateSchema,
  outputUrls: LiveOutputUrlsSchema,
  startedAt: IsoDateTimeSchema.nullable(),
  endedAt: IsoDateTimeSchema.nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type LiveSessionDto = z.infer<typeof LiveSessionSchema>;

export const LiveActionRequestSchema = z
  .object({
    action: LiveActionSchema,
    lineupItemId: IdSchema.optional(),
    sectionPosition: z.number().int().min(0).optional(),
    visualSlideId: IdSchema.optional(),
    visualStep: z.number().int().min(0).optional(),
    lineupVisualSlideId: IdSchema.optional(),
    countdownId: IdSchema.optional(),
    countdownTargets: z.array(OutputTargetSchema).min(1).max(4).optional(),
    message: z.string().trim().min(1).max(1000).optional(),
  })
  .superRefine((value, context) => {
    if (value.action === 'Preview' && !value.lineupItemId) {
      context.addIssue({
        code: 'custom',
        path: ['lineupItemId'],
        message: 'lineupItemId is required for Preview',
      });
    }
    if (
      (value.sectionPosition !== undefined ||
        value.visualSlideId !== undefined ||
        value.visualStep !== undefined ||
        value.lineupVisualSlideId !== undefined) &&
      value.action !== 'Preview'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['visualSlideId'],
        message: 'section selection is only supported for Preview',
      });
    }
    if (value.action === 'StartCountdown' && !value.countdownId) {
      context.addIssue({
        code: 'custom',
        path: ['countdownId'],
        message: 'countdownId is required for StartCountdown',
      });
    }
    if (
      value.countdownTargets !== undefined &&
      value.action !== 'StartCountdown'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['countdownTargets'],
        message: 'countdownTargets is only supported for StartCountdown',
      });
    }
    if (value.action === 'SendMessage' && !value.message) {
      context.addIssue({
        code: 'custom',
        path: ['message'],
        message: 'message is required for SendMessage',
      });
    }
  });
export type LiveActionRequestDto = z.infer<typeof LiveActionRequestSchema>;

export const LiveOutputAccessQuerySchema = z.object({
  key: z.string().min(16),
});
export type LiveOutputAccessQueryDto = z.infer<
  typeof LiveOutputAccessQuerySchema
>;
