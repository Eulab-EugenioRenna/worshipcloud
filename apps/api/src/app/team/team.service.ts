import {
  ServiceTeamAssignmentSchema,
  type AuthPrincipalDto,
  type CreateServiceTeamAssignmentRequestDto,
  type DomainEventPayloadDto,
  MyServiceTeamAssignmentSchema,
  type MyServiceTeamAssignmentDto,
  type ServiceTeamAssignmentDto,
  type TeamAssignmentStatus,
  type UpdateServiceTeamAssignmentRequestDto,
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
import { TeamAssignmentStatus as DbTeamAssignmentStatus } from '../../generated/prisma/client';

const STATUS_TO_DB: Record<TeamAssignmentStatus, DbTeamAssignmentStatus> = {
  Pending: 'PENDING',
  Accepted: 'ACCEPTED',
  Declined: 'DECLINED',
  Unavailable: 'UNAVAILABLE',
  ReplacementRequested: 'REPLACEMENT_REQUESTED',
};
const STATUS_FROM_DB: Record<string, TeamAssignmentStatus> = {
  PENDING: 'Pending',
  ACCEPTED: 'Accepted',
  DECLINED: 'Declined',
  UNAVAILABLE: 'Unavailable',
  REPLACEMENT_REQUESTED: 'ReplacementRequested',
};

@Injectable()
export class TeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventBusService,
    private readonly requestContext: RequestContextService,
  ) {}

  async list(
    userId: string,
    organizationId: string,
    serviceId: string,
  ): Promise<ServiceTeamAssignmentDto[]> {
    await this.requireMembership(userId, organizationId);
    await this.requireService(organizationId, serviceId);
    const assignments = await this.prisma.serviceTeamAssignment.findMany({
      where: { serviceId },
      include: { user: { select: { name: true } } },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    });
    return assignments.map((assignment) => this.toDto(assignment));
  }

  async listMine(
    userId: string,
    organizationId: string,
  ): Promise<MyServiceTeamAssignmentDto[]> {
    await this.requireMembership(userId, organizationId);
    const assignments = await this.prisma.serviceTeamAssignment.findMany({
      where: { userId, service: { organizationId } },
      include: {
        user: { select: { name: true } },
        service: { select: { title: true, date: true, time: true } },
      },
      orderBy: [{ service: { date: 'asc' } }, { service: { time: 'asc' } }],
    });
    return assignments.map((assignment) =>
      MyServiceTeamAssignmentSchema.parse({
        ...this.toDto(assignment),
        serviceTitle: assignment.service.title,
        serviceDate: assignment.service.date.toISOString().slice(0, 10),
        serviceTime: assignment.service.time,
      }),
    );
  }

  async assign(
    principal: AuthPrincipalDto,
    organizationId: string,
    serviceId: string,
    input: CreateServiceTeamAssignmentRequestDto,
  ): Promise<ServiceTeamAssignmentDto> {
    await this.requireEditor(principal.userId, organizationId);
    const service = await this.requireService(organizationId, serviceId);
    const member = await this.prisma.membership.findUnique({
      where: { organizationId_userId: { organizationId, userId: input.userId } },
      include: { user: { select: { active: true } } },
    });
    if (!member?.user.active) {
      throw new BadRequestException('Assigned user must be an active organization member');
    }
    try {
      const assignment = await this.prisma.serviceTeamAssignment.create({
        data: { serviceId, userId: input.userId, role: input.role, note: input.note },
        include: { user: { select: { name: true } } },
      });
      await this.publish(
        'service.team-assignment.created',
        principal.userId,
        organizationId,
        assignment.id,
        { serviceId, serviceTitle: service.title, targetUserId: assignment.userId },
      );
      return this.toDto(assignment);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('This member already has the selected service role');
      }
      throw error;
    }
  }

  async update(
    principal: AuthPrincipalDto,
    organizationId: string,
    serviceId: string,
    assignmentId: string,
    input: UpdateServiceTeamAssignmentRequestDto,
  ): Promise<ServiceTeamAssignmentDto> {
    const roles = await this.requireMembership(principal.userId, organizationId);
    const assignment = await this.requireAssignment(organizationId, serviceId, assignmentId);
    const canEdit = roles.some(
      (role) => role === 'OWNER' || role === 'ADMIN' || role === 'LEADER',
    );
    if (!canEdit && assignment.userId !== principal.userId) {
      throw new ForbiddenException('Only assigned members can update their availability');
    }
    if (!canEdit && (input.role !== undefined || input.note !== undefined)) {
      throw new ForbiddenException('Members may update only their assignment status');
    }
    if (!canEdit && input.status === undefined) {
      throw new BadRequestException('An availability status is required');
    }
    const updated = await this.prisma.serviceTeamAssignment.update({
      where: { id: assignmentId },
      data: {
        role: canEdit ? input.role : undefined,
        status: input.status ? STATUS_TO_DB[input.status] : undefined,
        note: canEdit ? input.note : undefined,
      },
    });
    await this.publish(
      'service.team-assignment.updated',
      principal.userId,
      organizationId,
      updated.id,
      {
        serviceId,
        serviceTitle: assignment.service.title,
        targetUserId: updated.userId,
      },
    );
    return this.toDto(await this.requireAssignment(organizationId, serviceId, updated.id));
  }

  async remove(
    principal: AuthPrincipalDto,
    organizationId: string,
    serviceId: string,
    assignmentId: string,
  ): Promise<void> {
    await this.requireEditor(principal.userId, organizationId);
    const assignment = await this.requireAssignment(organizationId, serviceId, assignmentId);
    await this.prisma.serviceTeamAssignment.delete({ where: { id: assignmentId } });
    await this.publish(
      'service.team-assignment.removed',
      principal.userId,
      organizationId,
      assignmentId,
      {
        serviceId,
        serviceTitle: assignment.service.title,
        targetUserId: assignment.userId,
      },
    );
  }

  private async requireService(organizationId: string, serviceId: string) {
    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, organizationId },
      select: { id: true, title: true },
    });
    if (!service) throw new NotFoundException('Service not found');
    return service;
  }

  private async requireAssignment(organizationId: string, serviceId: string, assignmentId: string) {
    const assignment = await this.prisma.serviceTeamAssignment.findFirst({
      where: { id: assignmentId, serviceId, service: { organizationId } },
      include: { service: { select: { title: true } }, user: { select: { name: true } } },
    });
    if (!assignment) throw new NotFoundException('Team assignment not found');
    return assignment;
  }

  private async requireMembership(userId: string, organizationId: string): Promise<string[]> {
    const membership = await this.prisma.membership.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: { roles: true },
    });
    if (!membership) throw new ForbiddenException('Organization access denied');
    return membership.roles;
  }

  private async isEditor(userId: string, organizationId: string): Promise<boolean> {
    const roles = await this.requireMembership(userId, organizationId);
    return roles.some((role) => role === 'OWNER' || role === 'ADMIN' || role === 'LEADER');
  }

  private async requireEditor(userId: string, organizationId: string): Promise<void> {
    if (!(await this.isEditor(userId, organizationId))) {
      throw new ForbiddenException('Team editing requires Owner, Admin, or Leader role');
    }
  }

  private publish(
    type: 'service.team-assignment.created' | 'service.team-assignment.updated' | 'service.team-assignment.removed',
    actorUserId: string,
    organizationId: string,
    subjectId: string,
    payload: DomainEventPayloadDto,
  ) {
    return this.events.publish({
      type,
      actorUserId,
      organizationId,
      subjectId,
      payload,
      correlationId: this.requestContext.requestId ?? 'system',
    });
  }

  private isUniqueViolation(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
  }

  private toDto(record: {
    id: string; serviceId: string; userId: string; role: string; status: string; note: string | null; createdAt: Date; updatedAt: Date;
    user: { name: string };
  }): ServiceTeamAssignmentDto {
    return ServiceTeamAssignmentSchema.parse({
      id: record.id, serviceId: record.serviceId, userId: record.userId,
      userName: record.user.name, role: record.role, status: STATUS_FROM_DB[record.status],
      ...(record.note ? { note: record.note } : {}),
      createdAt: record.createdAt.toISOString(), updatedAt: record.updatedAt.toISOString(),
    });
  }
}
