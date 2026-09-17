import {
  LocationSchema,
  OrganizationOverviewSchema,
  type AuthPrincipalDto,
  type AddOrganizationMemberRequestDto,
  type CreateLocationRequestDto,
  type DomainEventPayloadDto,
  type LocationDto,
  type OrganizationOverviewDto,
  type UpdateLocationRequestDto,
  type UpdateMemberRolesRequestDto,
  type UserRole,
} from '@worship/shared-dto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RequestContextService } from '../common/request-context.service';
import { PrismaService } from '../database/prisma.service';
import { EventBusService } from '../events/event-bus.service';
import { PasswordService } from '../auth/password.service';

const ROLE_NAMES: Record<string, UserRole> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  LEADER: 'Leader',
  OPERATOR: 'Operator',
  MEMBER: 'Member',
  VIEWER: 'Viewer',
};

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventBusService,
    private readonly requestContext: RequestContextService,
    private readonly passwords: PasswordService,
  ) {}

  async getOverview(
    userId: string,
    organizationId: string,
  ): Promise<OrganizationOverviewDto> {
    const membership = await this.prisma.membership.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: { roles: true },
    });
    if (!membership) throw new ForbiddenException('Organization access denied');
    if (
      !membership.roles.some(
        (role) => role === 'OWNER' || role === 'ADMIN' || role === 'LEADER',
      )
    ) {
      throw new ForbiddenException(
        'Organization overview requires Owner, Admin, or Leader role',
      );
    }

    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        locations: { orderBy: { name: 'asc' } },
        memberships: { include: { user: true }, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!organization) throw new NotFoundException('Organization not found');

    return OrganizationOverviewSchema.parse({
      organization: {
        id: organization.id,
        name: organization.name,
        createdAt: organization.createdAt.toISOString(),
        updatedAt: organization.updatedAt.toISOString(),
      },
      locations: organization.locations.map((location) => ({
        id: location.id,
        organizationId: location.organizationId,
        name: location.name,
        createdAt: location.createdAt.toISOString(),
        updatedAt: location.updatedAt.toISOString(),
      })),
      members: organization.memberships.map((member) => ({
        user: {
          id: member.user.id,
          name: member.user.name,
          active: member.user.active,
        },
        roles: member.roles.map((role) => ROLE_NAMES[role]),
        joinedAt: member.createdAt.toISOString(),
      })),
    });
  }

  async createLocation(
    principal: AuthPrincipalDto,
    organizationId: string,
    input: CreateLocationRequestDto,
  ): Promise<LocationDto> {
    await this.requireAdministrator(principal.userId, organizationId);
    try {
      const location = await this.prisma.location.create({
        data: { organizationId, name: input.name },
      });
      await this.publish('organization.location.created', principal.userId, organizationId, location.id, { title: location.name });
      return this.locationToDto(location);
    } catch (error) {
      if (this.isUniqueViolation(error)) throw new ConflictException('A location with this name already exists');
      throw error;
    }
  }

  async updateLocation(
    principal: AuthPrincipalDto,
    organizationId: string,
    locationId: string,
    input: UpdateLocationRequestDto,
  ): Promise<LocationDto> {
    await this.requireAdministrator(principal.userId, organizationId);
    await this.requireLocation(organizationId, locationId);
    try {
      const location = await this.prisma.location.update({ where: { id: locationId }, data: input });
      await this.publish('organization.location.updated', principal.userId, organizationId, location.id, { title: location.name });
      return this.locationToDto(location);
    } catch (error) {
      if (this.isUniqueViolation(error)) throw new ConflictException('A location with this name already exists');
      throw error;
    }
  }

  async removeLocation(
    principal: AuthPrincipalDto,
    organizationId: string,
    locationId: string,
  ): Promise<void> {
    await this.requireAdministrator(principal.userId, organizationId);
    const location = await this.requireLocation(organizationId, locationId);
    const serviceCount = await this.prisma.service.count({ where: { locationId } });
    if (serviceCount > 0) throw new BadRequestException('A location assigned to services cannot be deleted');
    await this.prisma.location.delete({ where: { id: locationId } });
    await this.publish('organization.location.deleted', principal.userId, organizationId, location.id, { title: location.name });
  }

  async updateMemberRoles(
    principal: AuthPrincipalDto,
    organizationId: string,
    userId: string,
    input: UpdateMemberRolesRequestDto,
  ): Promise<OrganizationOverviewDto> {
    await this.requireAdministrator(principal.userId, organizationId);
    if (input.roles.includes('Owner')) {
      await this.requireOwner(principal.userId, organizationId);
    }
    const roles = input.roles.map((role) => role.toUpperCase());
    const member = await this.prisma.membership.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: { roles: true },
    });
    if (!member) throw new NotFoundException('Organization member not found');
    const removesOwner = member.roles.includes('OWNER') && !roles.includes('OWNER');
    if (removesOwner) {
      const ownerCount = await this.prisma.membership.count({ where: { organizationId, roles: { has: 'OWNER' } } });
      if (ownerCount <= 1) throw new BadRequestException('An organization must retain at least one Owner');
    }
    await this.prisma.membership.update({
      where: { organizationId_userId: { organizationId, userId } },
      data: { roles: roles as ('OWNER' | 'ADMIN' | 'LEADER' | 'OPERATOR' | 'MEMBER' | 'VIEWER')[] },
    });
    await this.publish('organization.member.roles-updated', principal.userId, organizationId, userId, { title: 'Member roles updated' });
    return this.getOverview(principal.userId, organizationId);
  }

  async addMember(
    principal: AuthPrincipalDto,
    organizationId: string,
    input: AddOrganizationMemberRequestDto,
  ): Promise<OrganizationOverviewDto> {
    await this.requireAdministrator(principal.userId, organizationId);
    if (input.roles.includes('Owner')) {
      await this.requireOwner(principal.userId, organizationId);
    }
    const existing = await this.prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (!existing && (!input.name || !input.password)) {
      throw new BadRequestException('New members require a name and a temporary password');
    }
    const user = await this.prisma.$transaction(async (transaction) => {
      const account = existing
        ? existing
        : await transaction.user.create({
            data: {
              email: input.email,
              name: input.name!,
              credential: {
                create: { passwordHash: await this.passwords.hash(input.password!) },
              },
            },
            select: { id: true },
          });
      const membership = await transaction.membership.findUnique({
        where: { organizationId_userId: { organizationId, userId: account.id } },
        select: { userId: true },
      });
      if (membership) throw new ConflictException('This user is already a member of the organization');
      await transaction.membership.create({
        data: {
          organizationId,
          userId: account.id,
          roles: input.roles.map((role) => role.toUpperCase()) as ('OWNER' | 'ADMIN' | 'LEADER' | 'OPERATOR' | 'MEMBER' | 'VIEWER')[],
        },
      });
      return account;
    });
    await this.publish('organization.member.added', principal.userId, organizationId, user.id, { title: 'Member added', targetUserId: user.id });
    return this.getOverview(principal.userId, organizationId);
  }

  private async requireAdministrator(userId: string, organizationId: string): Promise<void> {
    const membership = await this.prisma.membership.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: { roles: true },
    });
    if (!membership || !membership.roles.some((role) => role === 'OWNER' || role === 'ADMIN')) {
      throw new ForbiddenException('Organization administration requires Owner or Admin role');
    }
  }

  private async requireOwner(userId: string, organizationId: string): Promise<void> {
    const membership = await this.prisma.membership.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: { roles: true },
    });
    if (!membership?.roles.includes('OWNER')) {
      throw new ForbiddenException('Only an Owner can grant the Owner role');
    }
  }

  private async requireLocation(organizationId: string, locationId: string) {
    const location = await this.prisma.location.findFirst({ where: { id: locationId, organizationId } });
    if (!location) throw new NotFoundException('Location not found');
    return location;
  }

  private locationToDto(location: { id: string; organizationId: string; name: string; createdAt: Date; updatedAt: Date }): LocationDto {
    return LocationSchema.parse({ ...location, createdAt: location.createdAt.toISOString(), updatedAt: location.updatedAt.toISOString() });
  }

  private publish(
    type: 'organization.location.created' | 'organization.location.updated' | 'organization.location.deleted' | 'organization.member.roles-updated' | 'organization.member.added',
    actorUserId: string,
    organizationId: string,
    subjectId: string,
    payload: DomainEventPayloadDto,
  ) {
    return this.events.publish({ type, actorUserId, organizationId, subjectId, payload, correlationId: this.requestContext.requestId ?? 'system' });
  }

  private isUniqueViolation(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
  }
}
