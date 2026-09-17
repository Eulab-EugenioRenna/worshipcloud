import {
  adaptDefaultCanvasLayout,
  CanvasLayoutSchema,
  isCanvasPositionOnlyOverride,
  ServiceSchema,
  templateKindsForLineupItem,
  type AuthPrincipalDto,
  type CanvasLayoutDto,
  type CreateLineupItemRequestDto,
  type CreateLineupVisualSlideRequestDto,
  type CreateServiceRequestDto,
  type LineupItemDto,
  type LineupItemListDto,
  type LineupItemType,
  type LineupVisualSlideDto,
  type DomainEventPayloadDto,
  type ReorderLineupRequestDto,
  type ServiceDto,
  type ServiceListQueryDto,
  type ServiceListResponseDto,
  type ServiceStatus,
  type TemplateKind,
  type UpdateLineupItemRequestDto,
  type UpdateLineupVisualSlideRequestDto,
  type UpdateServiceRequestDto,
  type UserRole,
} from '@worship/shared-dto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { RequestContextService } from '../common/request-context.service';
import { PrismaService } from '../database/prisma.service';
import { EventBusService } from '../events/event-bus.service';
import { SongsService } from '../songs/songs.service';

const STATUS_TO_DB = {
  Draft: 'DRAFT',
  Planning: 'PLANNING',
  Ready: 'READY',
  Live: 'LIVE',
  Completed: 'COMPLETED',
} as const;
const STATUS_FROM_DB: Record<string, ServiceStatus> = {
  DRAFT: 'Draft',
  PLANNING: 'Planning',
  READY: 'Ready',
  LIVE: 'Live',
  COMPLETED: 'Completed',
};
const ITEM_TO_DB = {
  Song: 'SONG',
  Bible: 'BIBLE',
  Slide: 'SLIDE',
  Image: 'IMAGE',
  Video: 'VIDEO',
  Audio: 'AUDIO',
  Countdown: 'COUNTDOWN',
  Clock: 'CLOCK',
  Sermon: 'SERMON',
  Text: 'TEXT',
  Blank: 'BLANK',
} as const;
const ITEM_FROM_DB: Record<string, LineupItemType> = Object.fromEntries(
  Object.entries(ITEM_TO_DB).map(([name, value]) => [value, name]),
) as Record<string, LineupItemType>;
const ROLE_FROM_DB: Record<string, UserRole> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  LEADER: 'Leader',
  OPERATOR: 'Operator',
  MEMBER: 'Member',
  VIEWER: 'Viewer',
};

@Injectable()
export class ServicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventBusService,
    private readonly requestContext: RequestContextService,
    private readonly songs: SongsService,
  ) {}

  async list(
    userId: string,
    organizationId: string,
    query: ServiceListQueryDto,
  ): Promise<ServiceListResponseDto> {
    await this.requireMembership(userId, organizationId);
    const records = await this.prisma.service.findMany({
      where: {
        organizationId,
        ...(query.status ? { status: STATUS_TO_DB[query.status] } : {}),
        ...(query.from || query.to
          ? {
              date: {
                ...(query.from ? { gte: this.date(query.from) } : {}),
                ...(query.to ? { lte: this.date(query.to) } : {}),
              },
            }
          : {}),
      },
      include: { lineup: { orderBy: { position: 'asc' } } },
      orderBy: [{ date: 'asc' }, { time: 'asc' }],
    });
    return records.map((record) => this.toDto(record));
  }

  async get(
    userId: string,
    organizationId: string,
    serviceId: string,
  ): Promise<ServiceDto> {
    await this.requireMembership(userId, organizationId);
    return this.getRecord(organizationId, serviceId);
  }

  async create(
    principal: AuthPrincipalDto,
    organizationId: string,
    input: CreateServiceRequestDto,
  ): Promise<ServiceDto> {
    await this.requireEditor(principal.userId, organizationId);
    await this.validateReferences(
      organizationId,
      input.locationId,
      input.responsibleUserId,
    );
    const created = await this.prisma.service.create({
      data: {
        organizationId,
        title: input.title,
        date: this.date(input.date),
        time: input.time,
        locationId: input.locationId,
        responsibleUserId: input.responsibleUserId,
        notes: input.notes,
      },
      include: { lineup: true },
    });
    await this.publish(
      'service.created',
      principal.userId,
      organizationId,
      created.id,
      { title: created.title },
    );
    return this.toDto(created);
  }

  async update(
    principal: AuthPrincipalDto,
    organizationId: string,
    serviceId: string,
    input: UpdateServiceRequestDto,
  ): Promise<ServiceDto> {
    await this.requireEditor(principal.userId, organizationId);
    const current = await this.getRecord(organizationId, serviceId);
    if (input.locationId || input.responsibleUserId) {
      await this.validateReferences(
        organizationId,
        input.locationId ?? current.locationId,
        input.responsibleUserId ?? current.responsibleUserId,
      );
    }
    const readiness = input.readiness;
    const updated = await this.prisma.service.update({
      where: { id: serviceId },
      data: {
        title: input.title,
        date: input.date ? this.date(input.date) : undefined,
        time: input.time,
        locationId: input.locationId,
        responsibleUserId: input.responsibleUserId,
        notes: input.notes,
        status: input.status ? STATUS_TO_DB[input.status] : undefined,
        teamReady: readiness?.team,
        mediaReady: readiness?.media,
        presentationReady: readiness?.presentation,
        outputsReady: readiness?.outputs,
      },
      include: { lineup: { orderBy: { position: 'asc' } } },
    });
    await this.publish(
      'service.updated',
      principal.userId,
      organizationId,
      serviceId,
      { title: updated.title },
    );
    return this.toDto(updated);
  }

  async remove(
    principal: AuthPrincipalDto,
    organizationId: string,
    serviceId: string,
  ): Promise<void> {
    await this.requireEditor(principal.userId, organizationId);
    const current = await this.getRecord(organizationId, serviceId);
    await this.prisma.service.delete({ where: { id: serviceId } });
    await this.publish(
      'service.deleted',
      principal.userId,
      organizationId,
      serviceId,
      { title: current.title },
    );
  }

  async addLineupItem(
    principal: AuthPrincipalDto,
    organizationId: string,
    serviceId: string,
    input: CreateLineupItemRequestDto,
  ): Promise<LineupItemDto> {
    await this.requireEditor(principal.userId, organizationId);
    const service = await this.getRecord(organizationId, serviceId);
    await this.validateSource(
      organizationId,
      input.type,
      input.sourceId,
      input.contentLocale,
    );
    if (input.type === 'Song' && input.sourceId) {
      await this.songs.synchronizePresentation(organizationId, input.sourceId);
    }
    const created = await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "Service" WHERE "id" = ${serviceId} FOR UPDATE`;
      const aggregate = await transaction.lineupItem.aggregate({
        where: { serviceId },
        _max: { position: true },
      });
      return transaction.lineupItem.create({
        data: {
          serviceId,
          type: ITEM_TO_DB[input.type],
          title: input.title,
          position: (aggregate._max.position ?? -1) + 1,
          sourceId: input.sourceId,
          contentLocale: input.contentLocale,
          notes: input.notes,
        },
      });
    });
    await this.publish(
      'service.lineup-item.created',
      principal.userId,
      organizationId,
      created.id,
      { serviceId, serviceTitle: service.title },
    );
    return this.lineupToDto(created);
  }

  async updateLineupItem(
    principal: AuthPrincipalDto,
    organizationId: string,
    serviceId: string,
    itemId: string,
    input: UpdateLineupItemRequestDto,
  ): Promise<LineupItemDto> {
    await this.requireEditor(principal.userId, organizationId);
    const service = await this.getRecord(organizationId, serviceId);
    const current = await this.requireLineupItem(serviceId, itemId);
    const nextType = input.type ?? ITEM_FROM_DB[current.type];
    const nextSourceId =
      input.sourceId === undefined
        ? (current.sourceId ?? undefined)
        : (input.sourceId ?? undefined);
    const nextContentLocale =
      input.contentLocale === undefined
        ? (current.contentLocale ?? undefined)
        : (input.contentLocale ?? undefined);
    await this.validateSource(
      organizationId,
      nextType,
      nextSourceId,
      nextContentLocale,
    );
    if (nextType === 'Song' && nextSourceId) {
      await this.songs.synchronizePresentation(organizationId, nextSourceId);
    }
    const updated = await this.prisma.lineupItem.update({
      where: { id: itemId },
      data: {
        type: input.type ? ITEM_TO_DB[input.type] : undefined,
        title: input.title,
        sourceId: input.sourceId,
        contentLocale: input.contentLocale,
        notes: input.notes,
      },
    });
    await this.publish(
      'service.lineup-item.updated',
      principal.userId,
      organizationId,
      itemId,
      { serviceId, serviceTitle: service.title },
    );
    return this.lineupToDto(updated);
  }

  /** Duplicates a cue with its output views immediately after the source cue. */
  async duplicateLineupItem(
    principal: AuthPrincipalDto,
    organizationId: string,
    serviceId: string,
    itemId: string,
  ): Promise<LineupItemDto> {
    await this.requireEditor(principal.userId, organizationId);
    const service = await this.getRecord(organizationId, serviceId);
    const duplicated = await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "Service" WHERE "id" = ${serviceId} FOR UPDATE`;
      const source = await transaction.lineupItem.findFirst({
        where: { id: itemId, serviceId },
        include: {
          visualSlides: {
            include: { layouts: true },
            orderBy: { position: 'asc' },
          },
        },
      });
      if (!source) throw new NotFoundException('Lineup item not found');
      const existing = await transaction.lineupItem.findMany({
        where: { serviceId },
        orderBy: { position: 'asc' },
        select: { id: true, position: true },
      });
      for (const item of existing) {
        await transaction.lineupItem.update({
          where: { id: item.id },
          data: { position: -item.position - 1 },
        });
      }
      const copy = await transaction.lineupItem.create({
        data: {
          serviceId,
          type: source.type,
          title:
            source.title.length > 173
              ? `${source.title.slice(0, 172)}… (copy)`
              : `${source.title} (copy)`,
          position: source.position + 1,
          sourceId: source.sourceId,
          contentLocale: source.contentLocale,
          notes: source.notes,
          visualSlides: {
            create: source.visualSlides.map((view) => ({
              name: view.name,
              position: view.position,
              layouts: {
                create: view.layouts.map((layout) => ({
                  target: layout.target,
                  templateId: layout.templateId,
                  layout: layout.layout as Prisma.InputJsonValue,
                })),
              },
            })),
          },
        },
      });
      for (const item of existing) {
        await transaction.lineupItem.update({
          where: { id: item.id },
          data: {
            position:
              item.position > source.position
                ? item.position + 1
                : item.position,
          },
        });
      }
      return copy;
    });
    await this.publish(
      'service.lineup-item.duplicated',
      principal.userId,
      organizationId,
      duplicated.id,
      { serviceId, serviceTitle: service.title, sourceId: itemId },
    );
    return this.lineupToDto(duplicated);
  }

  async removeLineupItem(
    principal: AuthPrincipalDto,
    organizationId: string,
    serviceId: string,
    itemId: string,
  ): Promise<void> {
    await this.requireEditor(principal.userId, organizationId);
    const service = await this.getRecord(organizationId, serviceId);
    await this.requireLineupItem(serviceId, itemId);
    await this.prisma.lineupItem.delete({ where: { id: itemId } });
    await this.publish(
      'service.lineup-item.deleted',
      principal.userId,
      organizationId,
      itemId,
      { serviceId, serviceTitle: service.title },
    );
  }

  async reorderLineup(
    principal: AuthPrincipalDto,
    organizationId: string,
    serviceId: string,
    input: ReorderLineupRequestDto,
  ): Promise<LineupItemListDto> {
    await this.requireEditor(principal.userId, organizationId);
    const service = await this.getRecord(organizationId, serviceId);
    const existingIds = service.lineup.map((item) => item.id);
    if (
      input.itemIds.length !== existingIds.length ||
      new Set(input.itemIds).size !== existingIds.length ||
      existingIds.some((id) => !input.itemIds.includes(id))
    ) {
      throw new BadRequestException(
        'itemIds must contain every lineup item exactly once',
      );
    }
    await this.prisma.$transaction(async (transaction) => {
      for (const [index, id] of input.itemIds.entries()) {
        await transaction.lineupItem.update({
          where: { id },
          data: { position: -index - 1 },
        });
      }
      for (const [index, id] of input.itemIds.entries()) {
        await transaction.lineupItem.update({
          where: { id },
          data: { position: index },
        });
      }
    });
    await this.publish(
      'service.lineup.reordered',
      principal.userId,
      organizationId,
      serviceId,
      { serviceId, serviceTitle: service.title },
    );
    return (await this.getRecord(organizationId, serviceId)).lineup;
  }

  async listLineupVisualSlides(
    userId: string,
    organizationId: string,
    serviceId: string,
    itemId: string,
  ): Promise<LineupVisualSlideDto[]> {
    await this.requireMembership(userId, organizationId);
    await this.getRecord(organizationId, serviceId);
    await this.requireLineupItem(serviceId, itemId);
    const slides = await this.prisma.lineupVisualSlide.findMany({
      where: { lineupItemId: itemId },
      include: { layouts: { orderBy: { target: 'asc' } } },
      orderBy: { position: 'asc' },
    });
    return slides.map((slide) => this.lineupVisualSlideToDto(slide));
  }

  async createLineupVisualSlide(
    principal: AuthPrincipalDto,
    organizationId: string,
    serviceId: string,
    itemId: string,
    input: CreateLineupVisualSlideRequestDto,
  ): Promise<LineupVisualSlideDto> {
    await this.requireEditor(principal.userId, organizationId);
    await this.getRecord(organizationId, serviceId);
    const item = await this.requireLineupItem(serviceId, itemId);
    await this.validateVisualLayouts(
      organizationId,
      input.layouts,
      ITEM_FROM_DB[item.type],
    );
    const slide = await this.prisma.$transaction(async (transaction) => {
      const aggregate = await transaction.lineupVisualSlide.aggregate({
        where: { lineupItemId: itemId },
        _max: { position: true },
      });
      return transaction.lineupVisualSlide.create({
        data: {
          lineupItemId: itemId,
          name: input.name,
          position: (aggregate._max.position ?? -1) + 1,
          layouts: {
            create: input.layouts.map((layout) => ({
              target: layout.target,
              templateId: layout.templateId ?? null,
              layout: layout.layout as Prisma.InputJsonValue,
            })),
          },
        },
        include: { layouts: { orderBy: { target: 'asc' } } },
      });
    });
    await this.publish(
      'service.lineup-visual-slide.created',
      principal.userId,
      organizationId,
      slide.id,
      { serviceId },
    );
    return this.lineupVisualSlideToDto(slide);
  }

  async updateLineupVisualSlide(
    principal: AuthPrincipalDto,
    organizationId: string,
    serviceId: string,
    itemId: string,
    visualSlideId: string,
    input: UpdateLineupVisualSlideRequestDto,
  ): Promise<LineupVisualSlideDto> {
    await this.requireEditor(principal.userId, organizationId);
    await this.getRecord(organizationId, serviceId);
    const item = await this.requireLineupItem(serviceId, itemId);
    const current = await this.requireLineupVisualSlide(itemId, visualSlideId);
    if (input.layouts)
      await this.validateVisualLayouts(
        organizationId,
        input.layouts,
        ITEM_FROM_DB[item.type],
      );
    const slide = await this.prisma.$transaction(async (transaction) => {
      if (input.layouts)
        await transaction.lineupVisualSlideLayout.deleteMany({
          where: { lineupVisualSlideId: current.id },
        });
      return transaction.lineupVisualSlide.update({
        where: { id: current.id },
        data: {
          name: input.name,
          ...(input.layouts
            ? {
                layouts: {
                  create: input.layouts.map((layout) => ({
                    target: layout.target,
                    templateId: layout.templateId ?? null,
                    layout: layout.layout as Prisma.InputJsonValue,
                  })),
                },
              }
            : {}),
        },
        include: { layouts: { orderBy: { target: 'asc' } } },
      });
    });
    await this.publish(
      'service.lineup-visual-slide.updated',
      principal.userId,
      organizationId,
      slide.id,
      { serviceId },
    );
    return this.lineupVisualSlideToDto(slide);
  }

  async removeLineupVisualSlide(
    principal: AuthPrincipalDto,
    organizationId: string,
    serviceId: string,
    itemId: string,
    visualSlideId: string,
  ): Promise<void> {
    await this.requireEditor(principal.userId, organizationId);
    await this.getRecord(organizationId, serviceId);
    const slide = await this.requireLineupVisualSlide(itemId, visualSlideId);
    await this.prisma.lineupVisualSlide.delete({ where: { id: slide.id } });
    await this.publish(
      'service.lineup-visual-slide.deleted',
      principal.userId,
      organizationId,
      slide.id,
      { serviceId },
    );
  }

  private async getRecord(
    organizationId: string,
    serviceId: string,
  ): Promise<ServiceDto> {
    const record = await this.prisma.service.findFirst({
      where: { id: serviceId, organizationId },
      include: { lineup: { orderBy: { position: 'asc' } } },
    });
    if (!record) throw new NotFoundException('Service not found');
    return this.toDto(record);
  }

  private async requireLineupItem(serviceId: string, itemId: string) {
    const item = await this.prisma.lineupItem.findFirst({
      where: { id: itemId, serviceId },
    });
    if (!item) throw new NotFoundException('Lineup item not found');
    return item;
  }

  private async requireLineupVisualSlide(
    itemId: string,
    visualSlideId: string,
  ) {
    const slide = await this.prisma.lineupVisualSlide.findFirst({
      where: { id: visualSlideId, lineupItemId: itemId },
    });
    if (!slide) throw new NotFoundException('Lineup visual slide not found');
    return slide;
  }

  private async validateVisualLayouts(
    organizationId: string,
    layouts: readonly {
      target: string;
      templateId?: string | null;
      layout: CanvasLayoutDto;
    }[],
    cueType: LineupItemType,
  ): Promise<void> {
    if (new Set(layouts.map((layout) => layout.target)).size !== layouts.length)
      throw new BadRequestException(
        'A visual scene can have one layout per output',
      );
    const templateIds = layouts
      .map((layout) => layout.templateId)
      .filter((id): id is string => Boolean(id));
    if (templateIds.length !== layouts.length)
      throw new BadRequestException(
        'Every cue view must reference a layout from Settings',
      );
    const templates = await this.prisma.slideTemplate.findMany({
      where: { organizationId, id: { in: templateIds } },
      select: { id: true, kind: true, target: true, layout: true },
    });
    if (templates.length !== new Set(templateIds).size)
      throw new BadRequestException(
        'A selected layout template does not belong to the organization',
      );
    const templatesById = new Map(
      templates.map((template) => [template.id, template]),
    );
    for (const layout of layouts) {
      const template = templatesById.get(layout.templateId!);
      if (
        !template ||
        template.target !== layout.target ||
        (template.kind !== 'Default' &&
          !templateKindsForLineupItem(cueType).includes(
            template.kind as TemplateKind,
          ))
      )
        throw new BadRequestException(
          'A cue view must use a matching Settings layout for its cue type and output',
        );
      const base = CanvasLayoutSchema.safeParse(template.layout);
      if (!base.success)
        throw new BadRequestException(
          'The selected view layout is not a valid canvas',
        );
      const effectiveBase =
        template.kind === 'Default'
          ? adaptDefaultCanvasLayout(base.data, cueType)
          : base.data;
      if (!isCanvasPositionOnlyOverride(effectiveBase, layout.layout)) {
        throw new BadRequestException(
          'A cue view can only change element position or size',
        );
      }
    }
  }

  private async validateSource(
    organizationId: string,
    type: LineupItemType,
    sourceId?: string,
    contentLocale?: string,
  ): Promise<void> {
    if (!sourceId) {
      if (contentLocale)
        throw new BadRequestException('contentLocale requires a source');
      if (
        [
          'Song',
          'Bible',
          'Slide',
          'Image',
          'Video',
          'Audio',
          'Countdown',
        ].includes(type)
      ) {
        throw new BadRequestException(
          `${type} lineup items require a library source`,
        );
      }
      return;
    }
    if (type === 'Song') {
      const song = await this.prisma.song.findFirst({
        where: { id: sourceId, organizationId },
        select: { id: true, locale: true },
      });
      if (!song)
        throw new BadRequestException(
          'Song source does not belong to the organization',
        );
      if (contentLocale && contentLocale !== song.locale) {
        const translation = await this.prisma.songTranslation.findUnique({
          where: { songId_locale: { songId: song.id, locale: contentLocale } },
          select: { id: true },
        });
        if (!translation)
          throw new BadRequestException(
            'Song translation is unavailable for contentLocale',
          );
      }
      return;
    }
    if (type === 'Bible') {
      const passage = await this.prisma.biblePassage.findFirst({
        where: { id: sourceId, organizationId },
        select: { id: true, translation: { select: { locale: true } } },
      });
      if (!passage)
        throw new BadRequestException(
          'Bible passage source does not belong to the organization',
        );
      if (contentLocale && contentLocale !== passage.translation.locale) {
        const translation =
          await this.prisma.biblePassageTranslation.findUnique({
            where: {
              passageId_locale: {
                passageId: passage.id,
                locale: contentLocale,
              },
            },
            select: { id: true },
          });
        if (!translation)
          throw new BadRequestException(
            'Bible reading aid is unavailable for contentLocale',
          );
      }
      return;
    }
    if (contentLocale)
      throw new BadRequestException(
        'contentLocale is supported only for Song and Bible cues',
      );
    if (type === 'Slide') {
      const slide = await this.prisma.slideDocument.findFirst({
        where: { id: sourceId, organizationId },
        select: { id: true },
      });
      if (!slide)
        throw new BadRequestException(
          'Slide source does not belong to the organization',
        );
      return;
    }
    if (type === 'Countdown') {
      const countdown = await this.prisma.countdownDefinition.findFirst({
        where: { id: sourceId, organizationId },
        select: { id: true },
      });
      if (!countdown)
        throw new BadRequestException(
          'Countdown source does not belong to the organization',
        );
      return;
    }
    if (type === 'Image' || type === 'Video' || type === 'Audio') {
      const asset = await this.prisma.mediaAsset.findFirst({
        where: { id: sourceId, organizationId },
        select: { id: true, kind: true },
      });
      if (!asset)
        throw new BadRequestException(
          'Media source does not belong to the organization',
        );
      const compatibleKinds: Record<string, string[]> = {
        Image: ['IMAGE', 'LOGO'],
        Video: ['VIDEO', 'MOTION_BACKGROUND', 'COUNTDOWN_VIDEO'],
        Audio: ['AUDIO'],
      };
      if (!compatibleKinds[type]?.includes(asset.kind)) {
        throw new BadRequestException(
          `${type} lineup items require a compatible media asset`,
        );
      }
      return;
    }
    throw new BadRequestException(
      `sourceId is not supported for ${type} lineup items`,
    );
  }

  private async requireMembership(
    userId: string,
    organizationId: string,
  ): Promise<readonly UserRole[]> {
    const membership = await this.prisma.membership.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: { roles: true },
    });
    if (!membership) throw new ForbiddenException('Organization access denied');
    return membership.roles.map((role) => ROLE_FROM_DB[role]);
  }

  private async requireEditor(
    userId: string,
    organizationId: string,
  ): Promise<void> {
    const roles = await this.requireMembership(userId, organizationId);
    if (
      !roles.some(
        (role) => role === 'Owner' || role === 'Admin' || role === 'Leader',
      )
    ) {
      throw new ForbiddenException(
        'Service editing requires Owner, Admin, or Leader role',
      );
    }
  }

  private async validateReferences(
    organizationId: string,
    locationId: string,
    responsibleUserId: string,
  ): Promise<void> {
    const [location, membership] = await Promise.all([
      this.prisma.location.findFirst({
        where: { id: locationId, organizationId },
        select: { id: true },
      }),
      this.prisma.membership.findUnique({
        where: {
          organizationId_userId: { organizationId, userId: responsibleUserId },
        },
        select: { userId: true },
      }),
    ]);
    if (!location)
      throw new BadRequestException(
        'Location does not belong to the organization',
      );
    if (!membership)
      throw new BadRequestException(
        'Responsible user does not belong to the organization',
      );
  }

  private publish(
    type: Parameters<EventBusService['publish']>[0]['type'],
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

  private date(value: string): Date {
    return new Date(`${value}T00:00:00.000Z`);
  }

  private toDto(record: {
    id: string;
    organizationId: string;
    locationId: string;
    responsibleUserId: string;
    title: string;
    date: Date;
    time: string;
    notes: string | null;
    status: string;
    teamReady: boolean;
    mediaReady: boolean;
    presentationReady: boolean;
    outputsReady: boolean;
    createdAt: Date;
    updatedAt: Date;
    lineup: readonly Parameters<ServicesService['lineupToDto']>[0][];
  }): ServiceDto {
    return ServiceSchema.parse({
      id: record.id,
      organizationId: record.organizationId,
      locationId: record.locationId,
      responsibleUserId: record.responsibleUserId,
      title: record.title,
      date: record.date.toISOString().slice(0, 10),
      time: record.time,
      ...(record.notes ? { notes: record.notes } : {}),
      status: STATUS_FROM_DB[record.status],
      readiness: {
        team: record.teamReady,
        media: record.mediaReady,
        presentation: record.presentationReady,
        outputs: record.outputsReady,
      },
      lineup: record.lineup.map((item) => this.lineupToDto(item)),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    });
  }

  private lineupToDto(record: {
    id: string;
    serviceId: string;
    type: string;
    title: string;
    position: number;
    sourceId: string | null;
    contentLocale: string | null;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): LineupItemDto {
    return {
      id: record.id,
      serviceId: record.serviceId,
      type: ITEM_FROM_DB[record.type],
      title: record.title,
      position: record.position,
      ...(record.sourceId ? { sourceId: record.sourceId } : {}),
      ...(record.contentLocale ? { contentLocale: record.contentLocale } : {}),
      ...(record.notes ? { notes: record.notes } : {}),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private lineupVisualSlideToDto(record: {
    id: string;
    lineupItemId: string;
    name: string;
    position: number;
    createdAt: Date;
    updatedAt: Date;
    layouts: readonly {
      target: string;
      templateId: string | null;
      layout: unknown;
    }[];
  }): LineupVisualSlideDto {
    return {
      id: record.id,
      lineupItemId: record.lineupItemId,
      name: record.name,
      position: record.position,
      layouts: record.layouts.map((layout) => ({
        target: layout.target as 'Main' | 'Stage' | 'Prompter' | 'Alpha',
        ...(layout.templateId ? { templateId: layout.templateId } : {}),
        layout: layout.layout,
      })),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    } as LineupVisualSlideDto;
  }
}
