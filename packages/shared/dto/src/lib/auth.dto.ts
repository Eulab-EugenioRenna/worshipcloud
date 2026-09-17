import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema } from './common.dto';

export const USER_ROLES = [
  'Owner',
  'Admin',
  'Leader',
  'Operator',
  'Member',
  'Viewer',
] as const;

export const UserRoleSchema = z.enum(USER_ROLES);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const UserSchema = z.object({
  id: IdSchema,
  name: z.string().trim().min(1).max(120),
  email: z.string().email(),
  active: z.boolean(),
});

export type UserDto = z.infer<typeof UserSchema>;

export const MembershipSummarySchema = z.object({
  organizationId: IdSchema,
  organizationName: z.string(),
  roles: z.array(UserRoleSchema),
});

export type MembershipSummaryDto = z.infer<typeof MembershipSummarySchema>;

export const RegisterRequestSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(10).max(128),
  organizationName: z.string().trim().min(2).max(160),
  locationName: z.string().trim().min(2).max(160).default('Main'),
});

export type RegisterRequestDto = z.infer<typeof RegisterRequestSchema>;

export const LoginRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(128),
});

export type LoginRequestDto = z.infer<typeof LoginRequestSchema>;

export const RefreshTokenRequestSchema = z.object({
  refreshToken: z.string().min(32),
});

export type RefreshTokenRequestDto = z.infer<typeof RefreshTokenRequestSchema>;

export const LogoutRequestSchema = RefreshTokenRequestSchema;
export type LogoutRequestDto = z.infer<typeof LogoutRequestSchema>;

export const AuthTokensSchema = z.object({
  accessToken: z.string(),
  accessTokenExpiresAt: IsoDateTimeSchema,
  refreshToken: z.string(),
  refreshTokenExpiresAt: IsoDateTimeSchema,
});

export type AuthTokensDto = z.infer<typeof AuthTokensSchema>;

export const AuthSessionSchema = z.object({
  user: UserSchema,
  memberships: z.array(MembershipSummarySchema),
  tokens: AuthTokensSchema,
});

export type AuthSessionDto = z.infer<typeof AuthSessionSchema>;

export const CurrentUserSchema = z.object({
  user: UserSchema,
  memberships: z.array(MembershipSummarySchema),
});

export type CurrentUserDto = z.infer<typeof CurrentUserSchema>;

export const AccessTokenClaimsSchema = z.object({
  sub: IdSchema,
  sid: IdSchema,
  type: z.literal('access'),
  iat: z.number().int(),
  exp: z.number().int(),
});

export type AccessTokenClaimsDto = z.infer<typeof AccessTokenClaimsSchema>;

export const AuthPrincipalSchema = z.object({
  userId: IdSchema,
  sessionId: IdSchema,
});

export type AuthPrincipalDto = z.infer<typeof AuthPrincipalSchema>;
