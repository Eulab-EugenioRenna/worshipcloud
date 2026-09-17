import {
  adaptDefaultCanvasLayout,
  applySongStepPagination,
  CanvasLayoutSchema,
  DEFAULT_LAYOUT_NAMES,
  defaultCanvasLayout,
  isDefaultLayoutName,
  SlideDocumentSchema,
  SlideTemplateSchema,
  type AuthPrincipalDto,
  type CanvasLayoutDto,
  type CreateSlideRequestDto,
  type CreateSlideTemplateRequestDto,
  type DomainEventPayloadDto,
  type LineupItemType,
  type OutputTarget,
  type SlideDocumentDto,
  type SlideListQueryDto,
  type SlideTemplateDto,
  type TemplateKind,
  type UpdateSlideRequestDto,
  type UpdateSlideTemplateRequestDto,
} from '@worship/shared-dto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { RequestContextService } from '../common/request-context.service';
import { PrismaService } from '../database/prisma.service';
import { EventBusService } from '../events/event-bus.service';

const KIND_TO_DB: Record<TemplateKind, string> = {
  Default: 'Default',
  Song: 'Song',
  Bible: 'Bible',
  Sermon: 'Sermon',
  Announcement: 'Announcement',
  LowerThird: 'LowerThird',
  Countdown: 'Countdown',
  Clock: 'Clock',
};

const DEFAULT_NAME_BY_TARGET: Record<OutputTarget, string> = {
  Main: 'Default',
  Stage: 'Default · Stage',
  Prompter: 'Default · Prompter',
  Alpha: 'Default · Alpha',
};

const LINEUP_TYPE_FROM_DB: Record<string, LineupItemType> = {
  SONG: 'Song',
  BIBLE: 'Bible',
  SLIDE: 'Slide',
  IMAGE: 'Image',
  VIDEO: 'Video',
  AUDIO: 'Audio',
  COUNTDOWN: 'Countdown',
  CLOCK: 'Clock',
  SERMON: 'Sermon',
  TEXT: 'Text',
  BLANK: 'Blank',
};

@Injectable()
export class SlidesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventBusService,
    private readonly requestContext: RequestContextService,
  ) {}

  async list(
    userId: string,
    organizationId: string,
    query: SlideListQueryDto,
  ): Promise<SlideDocumentDto[]> {
    await this.requireMembership(userId, organizationId);
    const slides = await this.prisma.slideDocument.findMany({
      where: {
        organizationId,
        ...(query.search
          ? { name: { contains: query.search, mode: 'insensitive' } }
          : {}),
      },
      include: { template: true },
      orderBy: { name: 'asc' },
    });
    return slides.map((slide) => this.slideToDto(slide));
  }

  async get(
    userId: string,
    organizationId: string,
    slideId: string,
  ): Promise<SlideDocumentDto> {
    await this.requireMembership(userId, organizationId);
    return this.requireSlide(organizationId, slideId);
  }

  async create(
    principal: AuthPrincipalDto,
    organizationId: string,
    input: CreateSlideRequestDto,
  ): Promise<SlideDocumentDto> {
    await this.requireEditor(principal.userId, organizationId);
    await this.validateTemplate(organizationId, input.templateId);
    const slide = await this.prisma.slideDocument.create({
      data: {
        organizationId,
        name: input.name,
        templateId: input.templateId,
        content: input.content as Prisma.InputJsonValue,
        notes: input.notes,
      },
      include: { template: true },
    });
    await this.publish(
      'slide.document.created',
      principal.userId,
      organizationId,
      slide.id,
      { title: slide.name },
    );
    return this.slideToDto(slide);
  }

  async update(
    principal: AuthPrincipalDto,
    organizationId: string,
    slideId: string,
    input: UpdateSlideRequestDto,
  ): Promise<SlideDocumentDto> {
    await this.requireEditor(principal.userId, organizationId);
    await this.requireSlide(organizationId, slideId);
    if (input.templateId !== undefined)
      await this.validateTemplate(organizationId, input.templateId);
    const { content, ...data } = input;
    const slide = await this.prisma.slideDocument.update({
      where: { id: slideId },
      data: {
        ...data,
        ...(content ? { content: content as Prisma.InputJsonValue } : {}),
      },
      include: { template: true },
    });
    await this.publish(
      'slide.document.updated',
      principal.userId,
      organizationId,
      slide.id,
      { title: slide.name },
    );
    return this.slideToDto(slide);
  }

  async remove(
    principal: AuthPrincipalDto,
    organizationId: string,
    slideId: string,
  ): Promise<void> {
    await this.requireEditor(principal.userId, organizationId);
    const slide = await this.requireSlide(organizationId, slideId);
    const used = await this.prisma.lineupItem.count({
      where: { sourceId: slideId, type: 'SLIDE' },
    });
    if (used)
      throw new BadRequestException(
        'A slide assigned to a service lineup cannot be deleted',
      );
    await this.prisma.slideDocument.delete({ where: { id: slideId } });
    await this.publish(
      'slide.document.deleted',
      principal.userId,
      organizationId,
      slideId,
      { title: slide.name },
    );
  }

  async listTemplates(
    userId: string,
    organizationId: string,
  ): Promise<SlideTemplateDto[]> {
    await this.requireMembership(userId, organizationId);
    // Older organizations were created before layouts became persistent. Make
    // their former in-code fallback a visible, editable global Settings view.
    await this.ensureDefaultTemplates(organizationId);
    const templates = await this.prisma.slideTemplate.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
    });
    return templates.map((template) => this.templateToDto(template));
  }

  async createTemplate(
    principal: AuthPrincipalDto,
    organizationId: string,
    input: CreateSlideTemplateRequestDto,
  ): Promise<SlideTemplateDto> {
    await this.requireEditor(principal.userId, organizationId);
    try {
      const template = await this.prisma.slideTemplate.create({
        data: {
          organizationId,
          name: input.name,
          kind: KIND_TO_DB[input.kind],
          target: input.target,
          layout: input.layout as Prisma.InputJsonValue,
        },
      });
      if (input.kind === 'Song' || input.kind === 'Default')
        await this.attachSongView(
          template.id,
          organizationId,
          template.target,
          input.layout,
        );
      await this.publish(
        'slide.template.created',
        principal.userId,
        organizationId,
        template.id,
        { title: template.name },
      );
      return this.templateToDto(template);
    } catch (error) {
      if (this.isUniqueViolation(error))
        throw new ConflictException('A template with this name already exists');
      throw error;
    }
  }

  async updateTemplate(
    principal: AuthPrincipalDto,
    organizationId: string,
    templateId: string,
    input: UpdateSlideTemplateRequestDto,
  ): Promise<SlideTemplateDto> {
    await this.requireEditor(principal.userId, organizationId);
    const current = await this.requireTemplate(organizationId, templateId);
    const { kind, layout, target, ...data } = input;
    if (
      isDefaultLayoutName(current.name) &&
      ((input.name !== undefined && input.name !== current.name) ||
        (target !== undefined && target !== current.target) ||
        (kind !== undefined && KIND_TO_DB[kind] !== current.kind))
    )
      throw new BadRequestException(
        'A Default layout can change its canvas, but not its name, type, or output',
      );
    if (
      (target && target !== current.target) ||
      (kind && KIND_TO_DB[kind] !== current.kind)
    ) {
      const [songLayouts, lineupLayouts] = await Promise.all([
        this.prisma.songVisualSlideLayout.count({ where: { templateId } }),
        this.prisma.lineupVisualSlideLayout.count({ where: { templateId } }),
      ]);
      if (songLayouts || lineupLayouts) {
        throw new BadRequestException(
          'A layout target or kind cannot change while views reference it',
        );
      }
    }
    try {
      const template = await this.prisma.$transaction(async (transaction) => {
        const updated = await transaction.slideTemplate.update({
          where: { id: templateId },
          data: {
            ...data,
            ...(kind ? { kind: KIND_TO_DB[kind] } : {}),
            ...(target ? { target } : {}),
            ...(layout ? { layout: layout as Prisma.InputJsonValue } : {}),
          },
        });
        if (layout)
          await this.refreshDependentViewLayouts(
            transaction,
            templateId,
            layout,
          );
        return updated;
      });
      await this.publish(
        'slide.template.updated',
        principal.userId,
        organizationId,
        template.id,
        { title: template.name },
      );
      return this.templateToDto(template);
    } catch (error) {
      if (this.isUniqueViolation(error))
        throw new ConflictException('A template with this name already exists');
      throw error;
    }
  }

  async removeTemplate(
    principal: AuthPrincipalDto,
    organizationId: string,
    templateId: string,
  ): Promise<void> {
    await this.requireEditor(principal.userId, organizationId);
    const template = await this.requireTemplate(organizationId, templateId);
    if (isDefaultLayoutName(template.name))
      throw new BadRequestException(
        'A Default layout is the required global fallback and cannot be removed',
      );
    const target = template.target as OutputTarget;
    const defaultName = DEFAULT_NAME_BY_TARGET[target];
    if (!defaultName)
      throw new BadRequestException(
        'The layout output does not have a matching Default',
      );
    await this.prisma.$transaction(async (transaction) => {
      const canonicalLayout = defaultCanvasLayout(target);
      const fallback = await transaction.slideTemplate.upsert({
        where: {
          organizationId_name: { organizationId, name: defaultName },
        },
        create: {
          organizationId,
          name: defaultName,
          kind: 'Default',
          target,
          layout: canonicalLayout as Prisma.InputJsonValue,
        },
        update: { kind: 'Default', target },
      });
      const parsedFallback = CanvasLayoutSchema.safeParse(fallback.layout);
      if (!parsedFallback.success)
        throw new BadRequestException(
          'The matching Default layout has an invalid canvas',
        );

      await transaction.slideDocument.updateMany({
        where: { templateId },
        data: { templateId: fallback.id },
      });

      const songLayouts = await transaction.songVisualSlideLayout.findMany({
        where: { templateId },
        include: {
          songVisualSlide: {
            include: {
              section: {
                include: { steps: { orderBy: { position: 'asc' } } },
              },
            },
          },
        },
      });
      const songFallback = adaptDefaultCanvasLayout(
        parsedFallback.data,
        'Song',
      );
      for (const layout of songLayouts) {
        await transaction.songVisualSlideLayout.update({
          where: { id: layout.id },
          data: {
            templateId: fallback.id,
            layout: applySongStepPagination(
              songFallback,
              layout.songVisualSlide.section.steps,
            ) as Prisma.InputJsonValue,
          },
        });
      }

      const lineupLayouts = await transaction.lineupVisualSlideLayout.findMany({
        where: { templateId },
        include: {
          lineupVisualSlide: {
            include: { lineupItem: { select: { type: true } } },
          },
        },
      });
      for (const layout of lineupLayouts) {
        const cueType =
          LINEUP_TYPE_FROM_DB[layout.lineupVisualSlide.lineupItem.type];
        if (!cueType)
          throw new BadRequestException(
            'A referenced cue has an unsupported content type',
          );
        const adaptedFallback = adaptDefaultCanvasLayout(
          parsedFallback.data,
          cueType,
        );
        await transaction.lineupVisualSlideLayout.update({
          where: { id: layout.id },
          data: {
            templateId: fallback.id,
            layout: this.withLocalPlacement(
              adaptedFallback,
              layout.layout,
            ) as Prisma.InputJsonValue,
          },
        });
      }

      await transaction.slideTemplate.delete({ where: { id: templateId } });
    });
    await this.publish(
      'slide.template.deleted',
      principal.userId,
      organizationId,
      templateId,
      { title: template.name },
    );
  }

  private async requireSlide(
    organizationId: string,
    slideId: string,
  ): Promise<SlideDocumentDto> {
    const slide = await this.prisma.slideDocument.findFirst({
      where: { id: slideId, organizationId },
      include: { template: true },
    });
    if (!slide) throw new NotFoundException('Slide not found');
    return this.slideToDto(slide);
  }

  private async ensureDefaultTemplates(organizationId: string): Promise<void> {
    const defaults = DEFAULT_LAYOUT_NAMES.map((name, index) => ({
      name,
      target: ['Main', 'Stage', 'Prompter', 'Alpha'][index] as
        'Main' | 'Stage' | 'Prompter' | 'Alpha',
    }));
    for (const item of defaults) {
      const layout = defaultCanvasLayout(item.target);
      const template = await this.prisma.$transaction(async (transaction) => {
        const saved = await transaction.slideTemplate.upsert({
          where: { organizationId_name: { organizationId, name: item.name } },
          create: {
            organizationId,
            name: item.name,
            kind: 'Default',
            target: item.target,
            layout: layout as Prisma.InputJsonValue,
          },
          update: { kind: 'Default', target: item.target },
        });
        return saved;
      });
      const savedLayout = CanvasLayoutSchema.safeParse(template.layout);
      await this.attachSongView(
        template.id,
        organizationId,
        item.target,
        savedLayout.success ? savedLayout.data : layout,
      );
    }
  }

  private async requireTemplate(organizationId: string, templateId: string) {
    const template = await this.prisma.slideTemplate.findFirst({
      where: { id: templateId, organizationId },
    });
    if (!template) throw new NotFoundException('Slide template not found');
    return template;
  }

  private async validateTemplate(
    organizationId: string,
    templateId: string | null | undefined,
  ): Promise<void> {
    if (templateId) await this.requireTemplate(organizationId, templateId);
  }

  /** Applies a changed Settings layout to every referenced view, preserving only its local placement. */
  private async refreshDependentViewLayouts(
    transaction: Prisma.TransactionClient,
    templateId: string,
    base: CanvasLayoutDto,
  ): Promise<void> {
    const songLayouts = await transaction.songVisualSlideLayout.findMany({
      where: { templateId },
      include: {
        songVisualSlide: {
          include: {
            section: {
              include: { steps: { orderBy: { position: 'asc' } } },
            },
          },
        },
      },
    });
    const lineupLayouts = await transaction.lineupVisualSlideLayout.findMany({
      where: { templateId },
      select: { id: true, layout: true },
    });
    for (const layout of songLayouts) {
      await transaction.songVisualSlideLayout.update({
        where: { id: layout.id },
        data: {
          layout: applySongStepPagination(
            base,
            layout.songVisualSlide.section.steps,
          ) as Prisma.InputJsonValue,
        },
      });
    }
    for (const layout of lineupLayouts) {
      await transaction.lineupVisualSlideLayout.update({
        where: { id: layout.id },
        data: {
          layout: this.withLocalPlacement(
            base,
            layout.layout,
          ) as Prisma.InputJsonValue,
        },
      });
    }
  }

  private withLocalPlacement(
    base: CanvasLayoutDto,
    stored: unknown,
  ): CanvasLayoutDto {
    const previous = CanvasLayoutSchema.safeParse(stored);
    if (!previous.success) return base;
    const previousById = new Map(
      previous.data.elements.map((element) => [element.id, element]),
    );
    return {
      ...base,
      elements: base.elements.map((element) => {
        const local = previousById.get(element.id);
        return local && local.type === element.type
          ? {
              ...element,
              x: local.x,
              y: local.y,
              width: local.width,
              height: local.height,
            }
          : element;
      }),
    };
  }

  /** Adding a Song view must immediately reach existing songs and output URLs. */
  private async attachSongView(
    templateId: string,
    organizationId: string,
    target: string,
    layout: CanvasLayoutDto,
  ): Promise<void> {
    const slides = await this.prisma.songVisualSlide.findMany({
      where: { song: { organizationId } },
      include: {
        section: { include: { steps: { orderBy: { position: 'asc' } } } },
      },
    });
    if (!slides.length) return;
    await this.prisma.songVisualSlideLayout.createMany({
      data: slides.map((slide) => ({
        songVisualSlideId: slide.id,
        target,
        templateId,
        layout: applySongStepPagination(
          layout,
          slide.section.steps,
        ) as Prisma.InputJsonValue,
      })),
      skipDuplicates: true,
    });
  }

  private async requireMembership(
    userId: string,
    organizationId: string,
  ): Promise<string[]> {
    const membership = await this.prisma.membership.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: { roles: true },
    });
    if (!membership) throw new ForbiddenException('Organization access denied');
    return membership.roles;
  }

  private async requireEditor(
    userId: string,
    organizationId: string,
  ): Promise<void> {
    const roles = await this.requireMembership(userId, organizationId);
    if (
      !roles.some(
        (role) => role === 'OWNER' || role === 'ADMIN' || role === 'LEADER',
      )
    )
      throw new ForbiddenException(
        'Slide editing requires Owner, Admin, or Leader role',
      );
  }

  private templateToDto(record: {
    id: string;
    organizationId: string;
    name: string;
    kind: string;
    target: string;
    layout: unknown;
    createdAt: Date;
    updatedAt: Date;
  }): SlideTemplateDto {
    return SlideTemplateSchema.parse({
      ...record,
      layout: record.layout,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    });
  }

  private slideToDto(record: {
    id: string;
    organizationId: string;
    templateId: string | null;
    name: string;
    content: unknown;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
    template: {
      id: string;
      organizationId: string;
      name: string;
      kind: string;
      target: string;
      layout: unknown;
      createdAt: Date;
      updatedAt: Date;
    } | null;
  }): SlideDocumentDto {
    return SlideDocumentSchema.parse({
      id: record.id,
      organizationId: record.organizationId,
      name: record.name,
      templateId: record.templateId,
      content: record.content,
      ...(record.notes ? { notes: record.notes } : {}),
      template: record.template ? this.templateToDto(record.template) : null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    });
  }

  private publish(
    type:
      | 'slide.template.created'
      | 'slide.template.updated'
      | 'slide.template.deleted'
      | 'slide.document.created'
      | 'slide.document.updated'
      | 'slide.document.deleted',
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
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }
}
