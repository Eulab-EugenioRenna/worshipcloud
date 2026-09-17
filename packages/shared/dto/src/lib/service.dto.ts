import { z } from 'zod';
import {
  DateOnlySchema,
  IdSchema,
  IsoDateTimeSchema,
  TimeSchema,
} from './common.dto';
import { LineupItemSchema } from './lineup.dto';

export const SERVICE_STATUSES = [
  'Draft',
  'Planning',
  'Ready',
  'Live',
  'Completed',
] as const;
export const ServiceStatusSchema = z.enum(SERVICE_STATUSES);
export type ServiceStatus = z.infer<typeof ServiceStatusSchema>;

export const ServiceReadinessSchema = z.object({
  team: z.boolean(),
  media: z.boolean(),
  presentation: z.boolean(),
  outputs: z.boolean(),
});
export type ServiceReadinessDto = z.infer<typeof ServiceReadinessSchema>;

export const CreateServiceRequestSchema = z.object({
  title: z.string().trim().min(2).max(180),
  date: DateOnlySchema,
  time: TimeSchema,
  locationId: IdSchema,
  responsibleUserId: IdSchema,
  notes: z.string().trim().max(5000).optional(),
});
export type CreateServiceRequestDto = z.infer<
  typeof CreateServiceRequestSchema
>;

export const UpdateServiceRequestSchema = CreateServiceRequestSchema.partial()
  .extend({
    notes: z.string().trim().max(5000).nullable().optional(),
    status: ServiceStatusSchema.optional(),
    readiness: ServiceReadinessSchema.partial().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });
export type UpdateServiceRequestDto = z.infer<
  typeof UpdateServiceRequestSchema
>;

export const ServiceSchema = CreateServiceRequestSchema.extend({
  id: IdSchema,
  organizationId: IdSchema,
  status: ServiceStatusSchema,
  readiness: ServiceReadinessSchema,
  lineup: z.array(LineupItemSchema),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type ServiceDto = z.infer<typeof ServiceSchema>;

export const ServiceListResponseSchema = z.array(ServiceSchema);
export type ServiceListResponseDto = z.infer<typeof ServiceListResponseSchema>;

export const ServiceListQuerySchema = z.object({
  from: DateOnlySchema.optional(),
  to: DateOnlySchema.optional(),
  status: ServiceStatusSchema.optional(),
});
export type ServiceListQueryDto = z.infer<typeof ServiceListQuerySchema>;
