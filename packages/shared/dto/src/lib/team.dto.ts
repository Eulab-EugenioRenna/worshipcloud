import { z } from 'zod';
import { DateOnlySchema, IdSchema, IsoDateTimeSchema, TimeSchema } from './common.dto';

export const TEAM_ASSIGNMENT_STATUSES = [
  'Pending',
  'Accepted',
  'Declined',
  'Unavailable',
  'ReplacementRequested',
] as const;
export const TeamAssignmentStatusSchema = z.enum(TEAM_ASSIGNMENT_STATUSES);
export type TeamAssignmentStatus = z.infer<typeof TeamAssignmentStatusSchema>;

export const ServiceTeamAssignmentSchema = z.object({
  id: IdSchema,
  serviceId: IdSchema,
  userId: IdSchema,
  userName: z.string().min(1).max(120),
  role: z.string().trim().min(2).max(80),
  status: TeamAssignmentStatusSchema,
  note: z.string().max(2000).optional(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type ServiceTeamAssignmentDto = z.infer<
  typeof ServiceTeamAssignmentSchema
>;

export const MyServiceTeamAssignmentSchema = ServiceTeamAssignmentSchema.extend({
  serviceTitle: z.string(),
  serviceDate: DateOnlySchema,
  serviceTime: TimeSchema,
});
export type MyServiceTeamAssignmentDto = z.infer<
  typeof MyServiceTeamAssignmentSchema
>;

export const CreateServiceTeamAssignmentRequestSchema = z.object({
  userId: IdSchema,
  role: z.string().trim().min(2).max(80),
  note: z.string().trim().max(2000).optional(),
});
export type CreateServiceTeamAssignmentRequestDto = z.infer<
  typeof CreateServiceTeamAssignmentRequestSchema
>;

export const UpdateServiceTeamAssignmentRequestSchema = z
  .object({
    role: z.string().trim().min(2).max(80).optional(),
    status: TeamAssignmentStatusSchema.optional(),
    note: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });
export type UpdateServiceTeamAssignmentRequestDto = z.infer<
  typeof UpdateServiceTeamAssignmentRequestSchema
>;
