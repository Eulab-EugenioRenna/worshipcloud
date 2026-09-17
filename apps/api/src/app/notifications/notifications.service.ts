import {
  DomainEventSchema,
  NotificationSchema,
  type DomainEventDto,
  type NotificationDto,
  type NotificationKind,
  type NotificationListQueryDto,
  type NotificationPageDto,
  type NotificationUnreadCountDto,
} from '@worship/shared-dto';
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { EventBusService } from '../events/event-bus.service';

@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private unsubscribe?: () => void;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.unsubscribe = this.eventBus.subscribe((event) => this.handle(event));
    const missed = await this.prisma.domainEvent.findMany({
      where: {
        organizationId: { not: null },
        type: {
          in: [
            'service.created',
            'service.updated',
            'service.deleted',
            'service.lineup-item.created',
            'service.lineup-item.duplicated',
            'service.lineup-item.updated',
            'service.lineup-item.deleted',
            'service.lineup.reordered',
            'service.lineup-visual-slide.created',
            'service.lineup-visual-slide.updated',
            'service.lineup-visual-slide.deleted',
            'service.team-assignment.created',
            'service.team-assignment.updated',
            'service.team-assignment.removed',
            'song.created',
            'song.updated',
            'song.deleted',
            'song.translation.updated',
            'song.translation.generated',
            'song.visual-slide.created',
            'song.visual-slide.updated',
            'song.visual-slide.deleted',
            'bible.translation.created',
            'bible.verses.imported',
            'bible.passage.created',
            'bible.passage-translation.generated',
            'media.asset.created',
            'media.asset.updated',
            'media.asset.deleted',
            'slide.template.created',
            'slide.template.updated',
            'slide.template.deleted',
            'slide.document.created',
            'slide.document.updated',
            'slide.document.deleted',
            'countdown.created',
            'countdown.updated',
            'countdown.deleted',
            'live.program-control.requested',
            'live.program-control.approved',
            'live.program-control.rejected',
            'organization.member.added',
          ],
        },
        notifications: { none: {} },
      },
      orderBy: { occurredAt: 'asc' },
    });
    for (const stored of missed) {
      const event = DomainEventSchema.parse({
        ...stored,
        occurredAt: stored.occurredAt.toISOString(),
      });
      await this.handle(event);
    }
  }

  onModuleDestroy(): void {
    this.unsubscribe?.();
  }

  async list(
    userId: string,
    query: NotificationListQueryDto,
  ): Promise<NotificationPageDto> {
    await this.requireMembership(userId, query.organizationId);
    const records = await this.prisma.notification.findMany({
      where: {
        userId,
        organizationId: query.organizationId,
        ...(query.unreadOnly ? { readAt: null } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = records.length > query.limit;
    const page = records.slice(0, query.limit);
    return {
      items: page.map((record) => this.toDto(record)),
      page: { nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null },
    };
  }

  async unreadCount(
    userId: string,
    organizationId: string,
  ): Promise<NotificationUnreadCountDto> {
    await this.requireMembership(userId, organizationId);
    return {
      count: await this.prisma.notification.count({
        where: { userId, organizationId, readAt: null },
      }),
    };
  }

  async markRead(
    userId: string,
    notificationId: string,
  ): Promise<NotificationDto> {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });
    if (!notification) throw new NotFoundException('Notification not found');
    await this.requireMembership(userId, notification.organizationId);
    const updated = await this.prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: notification.readAt ?? new Date() },
    });
    return this.toDto(updated);
  }

  async markAllRead(userId: string, organizationId: string): Promise<void> {
    await this.requireMembership(userId, organizationId);
    await this.prisma.notification.updateMany({
      where: { userId, organizationId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  private async handle(event: DomainEventDto): Promise<void> {
    const organizationId = event.organizationId;
    if (!organizationId) return;
    const content = this.contentFor(event);
    if (!content) return;
    const targetUserId = event.payload['targetUserId'];
    const members = await this.prisma.membership.findMany({
      where: {
        organizationId,
        user: { active: true },
        ...(typeof targetUserId === 'string' ? { userId: targetUserId } : {}),
      },
      select: { userId: true },
    });
    const created = await this.prisma.notification.createMany({
      data: members.map(({ userId }) => ({
        organizationId,
        userId,
        eventId: event.id,
        kind: content.kind,
        title: content.title,
        body: content.body,
        data: { subjectId: event.subjectId, eventType: event.type },
      })),
      skipDuplicates: true,
    });
    if (created.count > 0) {
      await this.eventBus.publish({
        type: 'notification.created',
        organizationId,
        actorUserId: event.actorUserId,
        subjectId: event.id,
        payload: {},
        correlationId: event.correlationId,
      });
    }
  }

  private contentFor(
    event: DomainEventDto,
  ): { kind: NotificationKind; title: string; body: string } | null {
    if (event.type === 'service.created')
      return {
        kind: 'ServiceCreated',
        title: 'New service',
        body: String(event.payload['title'] ?? ''),
      };
    if (event.type === 'service.updated')
      return {
        kind: 'ServiceUpdated',
        title: 'Service updated',
        body: String(event.payload['title'] ?? ''),
      };
    if (event.type === 'service.deleted')
      return {
        kind: 'ServiceDeleted',
        title: 'Service deleted',
        body: String(event.payload['title'] ?? ''),
      };
    if (event.type.startsWith('service.lineup'))
      return {
        kind: 'LineupChanged',
        title: 'Lineup updated',
        body: String(event.payload['serviceTitle'] ?? ''),
      };
    if (event.type.startsWith('service.team-assignment'))
      return {
        kind: 'TeamAssignment',
        title: 'Service assignment updated',
        body: String(event.payload['serviceTitle'] ?? ''),
      };
    if (event.type.startsWith('song.'))
      return {
        kind: 'SongChanged',
        title: 'Song library updated',
        body: String(event.payload['title'] ?? ''),
      };
    if (event.type.startsWith('bible.'))
      return {
        kind: 'BibleChanged',
        title: 'Bible library updated',
        body: String(event.payload['title'] ?? ''),
      };
    if (event.type.startsWith('media.'))
      return {
        kind: 'MediaChanged',
        title: 'Media library updated',
        body: String(event.payload['title'] ?? ''),
      };
    if (event.type.startsWith('slide.'))
      return {
        kind: 'SlideChanged',
        title: 'Slides updated',
        body: String(event.payload['title'] ?? ''),
      };
    if (event.type.startsWith('countdown.'))
      return {
        kind: 'CountdownChanged',
        title: 'Countdowns updated',
        body: String(event.payload['title'] ?? ''),
      };
    if (event.type.startsWith('live.program-control.'))
      return {
        kind: 'ProgramControlRequest',
        title: 'Live Program control',
        body: String(event.payload['title'] ?? ''),
      };
    if (event.type === 'organization.member.added')
      return {
        kind: 'MemberAdded',
        title: 'Welcome to the organization',
        body: String(event.payload['title'] ?? ''),
      };
    return null;
  }

  private async requireMembership(
    userId: string,
    organizationId: string,
  ): Promise<void> {
    const membership = await this.prisma.membership.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: { userId: true },
    });
    if (!membership) throw new ForbiddenException('Organization access denied');
  }

  private toDto(record: {
    id: string;
    organizationId: string;
    userId: string;
    eventId: string | null;
    kind: string;
    title: string;
    body: string;
    data: unknown;
    readAt: Date | null;
    createdAt: Date;
  }): NotificationDto {
    return NotificationSchema.parse({
      ...record,
      readAt: record.readAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
    });
  }
}
