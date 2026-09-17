import {
  CountdownDefinitionSchema,
  type AuthPrincipalDto,
  type CountdownDefinitionDto,
  type CountdownMode,
  type CreateCountdownRequestDto,
  type DomainEventPayloadDto,
  type UpdateCountdownRequestDto,
} from '@worship/shared-dto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RequestContextService } from '../common/request-context.service';
import { PrismaService } from '../database/prisma.service';
import { EventBusService } from '../events/event-bus.service';
import { CountdownMode as DbCountdownMode } from '../../generated/prisma/client';

const MODE_TO_DB: Record<CountdownMode, DbCountdownMode> = { Duration: 'DURATION', TargetTime: 'TARGET_TIME' };
const MODE_FROM_DB: Record<string, CountdownMode> = { DURATION: 'Duration', TARGET_TIME: 'TargetTime' };

@Injectable()
export class CountdownsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventBusService,
    private readonly requestContext: RequestContextService,
  ) {}

  async list(userId: string, organizationId: string): Promise<CountdownDefinitionDto[]> {
    await this.requireMembership(userId, organizationId);
    const definitions = await this.prisma.countdownDefinition.findMany({ where: { organizationId }, orderBy: { name: 'asc' } });
    return definitions.map((definition) => this.toDto(definition));
  }

  async create(principal: AuthPrincipalDto, organizationId: string, input: CreateCountdownRequestDto): Promise<CountdownDefinitionDto> {
    await this.requireEditor(principal.userId, organizationId);
    const { mode, targetAt, ...data } = input;
    const definition = await this.prisma.countdownDefinition.create({
      data: { organizationId, ...data, mode: MODE_TO_DB[mode], targetAt: targetAt ? new Date(targetAt) : undefined },
    });
    await this.publish('countdown.created', principal.userId, organizationId, definition.id, { title: definition.name });
    return this.toDto(definition);
  }

  async update(principal: AuthPrincipalDto, organizationId: string, countdownId: string, input: UpdateCountdownRequestDto): Promise<CountdownDefinitionDto> {
    await this.requireEditor(principal.userId, organizationId);
    const current = await this.requireDefinition(organizationId, countdownId);
    const nextMode = input.mode ?? MODE_FROM_DB[current.mode];
    const nextDuration = input.durationSeconds ?? current.durationSeconds;
    const nextTarget = input.targetAt ? new Date(input.targetAt) : current.targetAt;
    if (nextMode === 'Duration' && !nextDuration) throw new BadRequestException('Duration mode requires durationSeconds');
    if (nextMode === 'TargetTime' && !nextTarget) throw new BadRequestException('TargetTime mode requires targetAt');
    const { mode, targetAt, ...data } = input;
    const definition = await this.prisma.countdownDefinition.update({
      where: { id: countdownId },
      data: { ...data, ...(mode ? { mode: MODE_TO_DB[mode] } : {}), ...(targetAt ? { targetAt: new Date(targetAt) } : {}) },
    });
    await this.publish('countdown.updated', principal.userId, organizationId, definition.id, { title: definition.name });
    return this.toDto(definition);
  }

  async remove(principal: AuthPrincipalDto, organizationId: string, countdownId: string): Promise<void> {
    await this.requireEditor(principal.userId, organizationId);
    const definition = await this.requireDefinition(organizationId, countdownId);
    const usage = await this.prisma.lineupItem.count({ where: { sourceId: countdownId, type: 'COUNTDOWN' } });
    if (usage) throw new BadRequestException('A countdown assigned to a service lineup cannot be deleted');
    await this.prisma.countdownDefinition.delete({ where: { id: countdownId } });
    await this.publish('countdown.deleted', principal.userId, organizationId, countdownId, { title: definition.name });
  }

  private async requireDefinition(organizationId: string, countdownId: string) {
    const definition = await this.prisma.countdownDefinition.findFirst({ where: { id: countdownId, organizationId } });
    if (!definition) throw new NotFoundException('Countdown not found');
    return definition;
  }

  private async requireMembership(userId: string, organizationId: string): Promise<string[]> {
    const membership = await this.prisma.membership.findUnique({ where: { organizationId_userId: { organizationId, userId } }, select: { roles: true } });
    if (!membership) throw new ForbiddenException('Organization access denied');
    return membership.roles;
  }

  private async requireEditor(userId: string, organizationId: string): Promise<void> {
    const roles = await this.requireMembership(userId, organizationId);
    if (!roles.some((role) => role === 'OWNER' || role === 'ADMIN' || role === 'LEADER')) throw new ForbiddenException('Countdown editing requires Owner, Admin, or Leader role');
  }

  private toDto(record: { id: string; organizationId: string; name: string; mode: string; durationSeconds: number | null; targetAt: Date | null; autoAdvance: boolean; createdAt: Date; updatedAt: Date }): CountdownDefinitionDto {
    return CountdownDefinitionSchema.parse({
      id: record.id, organizationId: record.organizationId, name: record.name, mode: MODE_FROM_DB[record.mode],
      ...(record.durationSeconds !== null ? { durationSeconds: record.durationSeconds } : {}), ...(record.targetAt ? { targetAt: record.targetAt.toISOString() } : {}), autoAdvance: record.autoAdvance,
      createdAt: record.createdAt.toISOString(), updatedAt: record.updatedAt.toISOString(),
    });
  }

  private publish(type: 'countdown.created' | 'countdown.updated' | 'countdown.deleted', actorUserId: string, organizationId: string, subjectId: string, payload: DomainEventPayloadDto) {
    return this.events.publish({ type, actorUserId, organizationId, subjectId, payload, correlationId: this.requestContext.requestId ?? 'system' });
  }
}
