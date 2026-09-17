import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema } from './common.dto';
import { OutputTargetSchema } from './slide.dto';

export const COUNTDOWN_MODES = ['Duration', 'TargetTime'] as const;
export const CountdownModeSchema = z.enum(COUNTDOWN_MODES);
export type CountdownMode = z.infer<typeof CountdownModeSchema>;

const CountdownInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  mode: CountdownModeSchema,
  durationSeconds: z.number().int().min(1).max(86_400).optional(),
  targetAt: IsoDateTimeSchema.optional(),
  autoAdvance: z.boolean().default(false),
});

export const CreateCountdownRequestSchema = CountdownInputSchema
  .superRefine((value, context) => {
    if (value.mode === 'Duration' && value.durationSeconds === undefined) {
      context.addIssue({ code: 'custom', path: ['durationSeconds'], message: 'durationSeconds is required for Duration mode' });
    }
    if (value.mode === 'TargetTime' && value.targetAt === undefined) {
      context.addIssue({ code: 'custom', path: ['targetAt'], message: 'targetAt is required for TargetTime mode' });
    }
  });
export type CreateCountdownRequestDto = z.infer<typeof CreateCountdownRequestSchema>;

export const UpdateCountdownRequestSchema = CountdownInputSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: 'At least one field is required' },
);
export type UpdateCountdownRequestDto = z.infer<typeof UpdateCountdownRequestSchema>;

export const CountdownDefinitionSchema = CountdownInputSchema.extend({
  id: IdSchema,
  organizationId: IdSchema,
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type CountdownDefinitionDto = z.infer<typeof CountdownDefinitionSchema>;

export const LIVE_COUNTDOWN_STATUSES = ['Idle', 'Running', 'Paused'] as const;
export const LiveCountdownStatusSchema = z.enum(LIVE_COUNTDOWN_STATUSES);
export type LiveCountdownStatus = z.infer<typeof LiveCountdownStatusSchema>;

export const LiveCountdownStateSchema = z.object({
  countdownId: IdSchema,
  name: z.string().trim().min(1).default('Timer'),
  status: LiveCountdownStatusSchema,
  remainingSeconds: z.number().int().min(0),
  startedAt: IsoDateTimeSchema.nullable(),
  endsAt: IsoDateTimeSchema.nullable(),
  autoAdvance: z.boolean(),
  /** Outputs where the timer is intentionally visible. */
  visibleOn: z.array(OutputTargetSchema).min(1).default(['Stage', 'Prompter']),
});
export type LiveCountdownStateDto = z.infer<typeof LiveCountdownStateSchema>;
