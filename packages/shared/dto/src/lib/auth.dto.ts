export const USER_ROLES = [
  'Owner',
  'Admin',
  'Leader',
  'Operator',
  'Member',
  'Viewer',
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export interface UserDto {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly roles: readonly UserRole[];
}
