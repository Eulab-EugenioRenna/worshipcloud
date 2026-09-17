import { z } from 'zod';
import { UserRoleSchema } from './auth.dto';
import { IdSchema, IsoDateTimeSchema } from './common.dto';

export const OrganizationSchema = z.object({
  id: IdSchema,
  name: z.string(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type OrganizationDto = z.infer<typeof OrganizationSchema>;

export const LocationSchema = z.object({
  id: IdSchema,
  organizationId: IdSchema,
  name: z.string(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type LocationDto = z.infer<typeof LocationSchema>;

export const CreateLocationRequestSchema = z.object({
  name: z.string().trim().min(2).max(160),
});
export type CreateLocationRequestDto = z.infer<
  typeof CreateLocationRequestSchema
>;

export const UpdateLocationRequestSchema = CreateLocationRequestSchema;
export type UpdateLocationRequestDto = z.infer<
  typeof UpdateLocationRequestSchema
>;

export const OrganizationUserSummarySchema = z.object({
  id: IdSchema,
  name: z.string().trim().min(1).max(120),
  active: z.boolean(),
});
export type OrganizationUserSummaryDto = z.infer<
  typeof OrganizationUserSummarySchema
>;

export const OrganizationMemberSchema = z.object({
  user: OrganizationUserSummarySchema,
  roles: z.array(UserRoleSchema),
  joinedAt: IsoDateTimeSchema,
});
export type OrganizationMemberDto = z.infer<typeof OrganizationMemberSchema>;

export const OrganizationOverviewSchema = z.object({
  organization: OrganizationSchema,
  locations: z.array(LocationSchema),
  members: z.array(OrganizationMemberSchema),
});
export type OrganizationOverviewDto = z.infer<
  typeof OrganizationOverviewSchema
>;

export const UpdateMemberRolesRequestSchema = z.object({
  roles: z.array(UserRoleSchema).min(1),
});
export type UpdateMemberRolesRequestDto = z.infer<
  typeof UpdateMemberRolesRequestSchema
>;

export const AddOrganizationMemberRequestSchema = z
  .object({
    email: z.string().trim().toLowerCase().email(),
    name: z.string().trim().min(2).max(120).optional(),
    password: z.string().min(10).max(128).optional(),
    roles: z.array(UserRoleSchema).min(1),
  })
  .superRefine((value, context) => {
    if ((value.name === undefined) !== (value.password === undefined)) {
      context.addIssue({
        code: 'custom',
        message: 'name and password must be provided together for a new account',
      });
    }
  });
export type AddOrganizationMemberRequestDto = z.infer<
  typeof AddOrganizationMemberRequestSchema
>;
