import {
  CanvasLayoutSchema,
  applySongStepPagination,
  DEFAULT_SONG_STEP_GENERATION_RULES,
  generateSongSectionSteps,
  isDefaultLayoutName,
  defaultCanvasLayout,
  SongStepGenerationRulesSchema,
  SongSchema,
  SongVisualSlideSchema,
  type AuthPrincipalDto,
  type CreateSongRequestDto,
  type DomainEventPayloadDto,
  type GenerateSongTranslationRequestDto,
  type ImportSongsRequestDto,
  type ImportSongsResponseDto,
  type ImportSourceDto,
  type SongImportCommandDto,
  type ReplaceSongArrangementsRequestDto,
  type ReplaceSongSectionStepsRequestDto,
  type SongStepGenerationRulesDto,
  type SongDto,
  type SongListQueryDto,
  type SongTranslationDto,
  type SongTranslationInputDto,
  type SongVisualSlideDto,
  type SongVisualSlideInputDto,
  type UpdateSongVisualSlideRequestDto,
  type UpdateSongRequestDto,
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
import { TranslationService } from '../translations/translation.service';
import { ImportSourcesService } from '../import-sources/import-sources.service';
import { Prisma } from '../../generated/prisma/client';

@Injectable()
export class SongsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventBusService,
    private readonly requestContext: RequestContextService,
    private readonly translations: TranslationService,
    private readonly importSources: ImportSourcesService,
  ) {}

  listImportSources(): ImportSourceDto[] {
    return this.importSources.list('Song');
  }

  async list(
    userId: string,
    organizationId: string,
    query: SongListQueryDto,
  ): Promise<SongDto[]> {
    await this.requireMembership(userId, organizationId);
    const songs = await this.prisma.song.findMany({
      where: {
        organizationId,
        ...(query.search
          ? { title: { contains: query.search, mode: 'insensitive' } }
          : {}),
      },
      include: {
        sections: {
          include: { steps: { orderBy: { position: 'asc' } } },
          orderBy: { position: 'asc' },
        },
        arrangements: { orderBy: { name: 'asc' } },
        translations: {
          include: { sections: { orderBy: { position: 'asc' } } },
          orderBy: { locale: 'asc' },
        },
        visualSlides: {
          include: { layouts: { orderBy: { target: 'asc' } } },
          orderBy: { position: 'asc' },
        },
      },
      orderBy: { title: 'asc' },
    });
    return songs.map((song) => this.toDto(song));
  }

  async get(
    userId: string,
    organizationId: string,
    songId: string,
  ): Promise<SongDto> {
    await this.requireMembership(userId, organizationId);
    return this.getRecord(organizationId, songId);
  }

  async create(
    principal: AuthPrincipalDto,
    organizationId: string,
    input: CreateSongRequestDto,
  ): Promise<SongDto> {
    await this.requireEditor(principal.userId, organizationId);
    const songId = await this.prisma.$transaction(async (transaction) => {
      const rules = await this.resolveStepGenerationRules(
        transaction,
        organizationId,
      );
      const song = await transaction.song.create({
        data: {
          organizationId,
          locale: input.locale,
          title: input.title,
          author: input.author,
          copyright: input.copyright,
          ccli: input.ccli,
          key: input.key,
          bpm: input.bpm,
          sections: {
            create: input.sections.map((section, position) => ({
              ...section,
              type: this.sectionToDb(section.type),
              position,
              steps: {
                create: generateSongSectionSteps(section.content, rules),
              },
            })),
          },
        },
        select: { id: true },
      });
      await this.createMissingVisualSlides(
        transaction,
        organizationId,
        song.id,
      );
      return song.id;
    });
    const song = await this.getRecord(organizationId, songId);
    await this.publish(
      'song.created',
      principal.userId,
      organizationId,
      song.id,
      { title: song.title },
    );
    return song;
  }

  async importRemote(
    principal: AuthPrincipalDto,
    organizationId: string,
    command: SongImportCommandDto,
  ): Promise<ImportSongsResponseDto> {
    await this.requireEditor(principal.userId, organizationId);
    const input =
      'songs' in command
        ? command
        : await this.importSources.loadSongs(command);
    return this.importSongs(principal, organizationId, input);
  }

  private async importSongs(
    principal: AuthPrincipalDto,
    organizationId: string,
    input: ImportSongsRequestDto,
  ): Promise<ImportSongsResponseDto> {
    await this.requireEditor(principal.userId, organizationId);
    const songIds = await this.prisma.$transaction(async (transaction) => {
      const rules = await this.resolveStepGenerationRules(
        transaction,
        organizationId,
      );
      const ids: string[] = [];
      for (const song of input.songs) {
        const created = await transaction.song.create({
          data: {
            organizationId,
            locale: song.locale,
            title: song.title,
            author: song.author,
            copyright: song.copyright,
            ccli: song.ccli,
            key: song.key,
            bpm: song.bpm,
            sections: {
              create: song.sections.map((section, position) => ({
                ...section,
                type: this.sectionToDb(section.type),
                position,
                steps: {
                  create: generateSongSectionSteps(section.content, rules),
                },
              })),
            },
          },
          select: { id: true },
        });
        await this.createMissingVisualSlides(
          transaction,
          organizationId,
          created.id,
        );
        ids.push(created.id);
      }
      return ids;
    });
    const songs = await Promise.all(
      songIds.map((songId) => this.getRecord(organizationId, songId)),
    );
    await Promise.all(
      songs.map((song) =>
        this.publish(
          'song.created',
          principal.userId,
          organizationId,
          song.id,
          {
            title: song.title,
          },
        ),
      ),
    );
    return { imported: songs.length, songs };
  }

  async update(
    principal: AuthPrincipalDto,
    organizationId: string,
    songId: string,
    input: UpdateSongRequestDto,
  ): Promise<SongDto> {
    await this.requireEditor(principal.userId, organizationId);
    const current = await this.getRecord(organizationId, songId);
    await this.prisma.$transaction(async (transaction) => {
      const rules = await this.resolveStepGenerationRules(
        transaction,
        organizationId,
      );
      if (input.sections !== undefined) {
        const existingSectionIds = new Set(
          current.sections.map((section) => section.id),
        );
        const suppliedSectionIds = input.sections.flatMap((section) =>
          section.id ? [section.id] : [],
        );
        if (
          new Set(suppliedSectionIds).size !== suppliedSectionIds.length ||
          suppliedSectionIds.some((id) => !existingSectionIds.has(id))
        ) {
          throw new BadRequestException(
            'Song sections must retain only identities that belong to this song',
          );
        }
        const retainedSectionIds = new Set(suppliedSectionIds);
        const referencedSectionIds = current.visualSlides.map(
          (slide) => slide.sectionId,
        );
        if (
          referencedSectionIds.some(
            (sectionId) => !retainedSectionIds.has(sectionId),
          )
        ) {
          throw new BadRequestException(
            'A lyric section used by a visual slide cannot be removed. Move or remove that visual slide first.',
          );
        }
        await transaction.songArrangement.deleteMany({ where: { songId } });
        // Temporary positions avoid unique-key collisions while a section is reordered or removed.
        await Promise.all(
          current.sections.map((section) =>
            transaction.songSection.update({
              where: { id: section.id },
              data: { position: -section.position - 1 },
            }),
          ),
        );
        await transaction.songSection.deleteMany({
          where: { songId, id: { notIn: suppliedSectionIds } },
        });
        await Promise.all(
          input.sections.map((section, position) =>
            section.id
              ? transaction.songSection.update({
                  where: { id: section.id },
                  data: {
                    type: this.sectionToDb(section.type),
                    label: section.label,
                    content: section.content,
                    position,
                    steps: {
                      deleteMany: {},
                      create: generateSongSectionSteps(section.content, rules),
                    },
                  },
                })
              : transaction.songSection.create({
                  data: {
                    songId,
                    type: this.sectionToDb(section.type),
                    label: section.label,
                    content: section.content,
                    position,
                    steps: {
                      create: generateSongSectionSteps(section.content, rules),
                    },
                  },
                }),
          ),
        );
      }
      await transaction.song.update({
        where: { id: songId },
        data: {
          title: input.title,
          locale: input.locale,
          author: input.author,
          copyright: input.copyright,
          ccli: input.ccli,
          key: input.key,
          bpm: input.bpm,
        },
      });
      if (input.sections !== undefined) {
        await this.createMissingVisualSlides(
          transaction,
          organizationId,
          songId,
        );
      }
    });
    const updated = await this.getRecord(organizationId, songId);
    await this.publish(
      'song.updated',
      principal.userId,
      organizationId,
      updated.id,
      { title: updated.title },
    );
    return updated;
  }

  async regenerateSteps(
    principal: AuthPrincipalDto,
    organizationId: string,
    songId: string,
  ): Promise<SongDto> {
    await this.requireEditor(principal.userId, organizationId);
    await this.synchronizePresentation(organizationId, songId);
    const updated = await this.getRecord(organizationId, songId);
    await this.publish(
      'song.updated',
      principal.userId,
      organizationId,
      songId,
      {
        title: updated.title,
      },
    );
    return updated;
  }

  /** Rebuilds canonical steps and every derived output page from current Settings. */
  async synchronizePresentation(
    organizationId: string,
    songId: string,
  ): Promise<void> {
    const song = await this.prisma.song.findFirst({
      where: { id: songId, organizationId },
      select: { id: true },
    });
    if (!song) throw new NotFoundException('Song not found');
    await this.prisma.$transaction(async (transaction) => {
      const rules = await this.resolveStepGenerationRules(
        transaction,
        organizationId,
      );
      const sections = await transaction.songSection.findMany({
        where: { songId },
        orderBy: { position: 'asc' },
      });
      for (const section of sections) {
        await transaction.songStep.deleteMany({
          where: { sectionId: section.id },
        });
        await transaction.songStep.createMany({
          data: generateSongSectionSteps(section.content, rules).map(
            (step) => ({
              ...step,
              sectionId: section.id,
            }),
          ),
        });
      }
      await this.createMissingVisualSlides(transaction, organizationId, songId);
    });
  }

  async replaceSectionSteps(
    principal: AuthPrincipalDto,
    organizationId: string,
    songId: string,
    sectionId: string,
    input: ReplaceSongSectionStepsRequestDto,
  ): Promise<SongDto> {
    await this.requireEditor(principal.userId, organizationId);
    const song = await this.getRecord(organizationId, songId);
    this.requireSongSection(song, sectionId);
    if (
      input.steps.some(
        (content) =>
          content.split(/\r?\n/).filter((line) => line.trim()).length > 8,
      )
    ) {
      throw new BadRequestException(
        'A manual step can contain at most 8 lines',
      );
    }
    await this.prisma.$transaction(async (transaction) => {
      await transaction.songStep.deleteMany({ where: { sectionId } });
      let sourceLine = 1;
      await transaction.songStep.createMany({
        data: input.steps.map((content, position) => {
          const lines = content
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);
          const lineStart = sourceLine;
          sourceLine += Math.max(1, lines.length);
          return {
            sectionId,
            position,
            content: lines.join('\n'),
            lines,
            lineStart,
            lineEnd: sourceLine - 1,
          };
        }),
      });
      await this.createMissingVisualSlides(transaction, organizationId, songId);
    });
    const updated = await this.getRecord(organizationId, songId);
    await this.publish(
      'song.updated',
      principal.userId,
      organizationId,
      songId,
      {
        title: updated.title,
      },
    );
    return updated;
  }

  async replaceArrangements(
    principal: AuthPrincipalDto,
    organizationId: string,
    songId: string,
    input: ReplaceSongArrangementsRequestDto,
  ): Promise<SongDto> {
    await this.requireEditor(principal.userId, organizationId);
    const current = await this.getRecord(organizationId, songId);
    const sectionIds = new Set(current.sections.map((section) => section.id));
    const names = new Set<string>();
    for (const arrangement of input.arrangements) {
      if (names.has(arrangement.name)) {
        throw new BadRequestException('Arrangement names must be unique');
      }
      names.add(arrangement.name);
      if (
        arrangement.sectionIds.some((sectionId) => !sectionIds.has(sectionId))
      ) {
        throw new BadRequestException(
          'Arrangement sections must belong to the song',
        );
      }
    }
    const song = await this.prisma.$transaction(async (transaction) => {
      await transaction.songArrangement.deleteMany({ where: { songId } });
      return transaction.song.update({
        where: { id: songId },
        data: { arrangements: { create: input.arrangements } },
        include: {
          sections: {
            include: { steps: { orderBy: { position: 'asc' } } },
            orderBy: { position: 'asc' },
          },
          arrangements: { orderBy: { name: 'asc' } },
        },
      });
    });
    await this.publish(
      'song.updated',
      principal.userId,
      organizationId,
      song.id,
      { title: song.title },
    );
    return this.toDto(song);
  }

  async listTranslations(
    userId: string,
    organizationId: string,
    songId: string,
  ): Promise<SongTranslationDto[]> {
    await this.requireMembership(userId, organizationId);
    await this.getRecord(organizationId, songId);
    const translations = await this.prisma.songTranslation.findMany({
      where: { songId },
      include: { sections: { orderBy: { position: 'asc' } } },
      orderBy: { locale: 'asc' },
    });
    return translations.map((translation) =>
      this.translationToDto(translation),
    );
  }

  async listVisualSlides(
    userId: string,
    organizationId: string,
    songId: string,
  ): Promise<SongVisualSlideDto[]> {
    await this.requireMembership(userId, organizationId);
    await this.getRecord(organizationId, songId);
    const slides = await this.prisma.songVisualSlide.findMany({
      where: { songId },
      include: { layouts: { orderBy: { target: 'asc' } } },
      orderBy: { position: 'asc' },
    });
    return slides.map((slide) => this.visualSlideToDto(slide));
  }

  async createVisualSlide(
    principal: AuthPrincipalDto,
    organizationId: string,
    songId: string,
    input: SongVisualSlideInputDto,
  ): Promise<SongVisualSlideDto> {
    await this.requireEditor(principal.userId, organizationId);
    const song = await this.getRecord(organizationId, songId);
    this.requireSongSection(song, input.sectionId);
    const layouts = await this.resolveVisualLayouts(
      organizationId,
      input.layouts,
      song.sections.find((section) => section.id === input.sectionId)!.steps,
    );
    const aggregate = await this.prisma.songVisualSlide.aggregate({
      where: { songId },
      _max: { position: true },
    });
    const slide = await this.prisma.songVisualSlide.create({
      data: {
        songId,
        sectionId: input.sectionId,
        name: input.name,
        position: (aggregate._max.position ?? -1) + 1,
        layouts: { create: layouts },
      },
      include: { layouts: { orderBy: { target: 'asc' } } },
    });
    await this.publish(
      'song.visual-slide.created',
      principal.userId,
      organizationId,
      slide.id,
      { title: `${song.title} · ${slide.name}`, sourceId: songId },
    );
    return this.visualSlideToDto(slide);
  }

  async updateVisualSlide(
    principal: AuthPrincipalDto,
    organizationId: string,
    songId: string,
    visualSlideId: string,
    input: UpdateSongVisualSlideRequestDto,
  ): Promise<SongVisualSlideDto> {
    await this.requireEditor(principal.userId, organizationId);
    const song = await this.getRecord(organizationId, songId);
    const current = await this.requireVisualSlide(songId, visualSlideId);
    const sectionId = input.sectionId ?? current.sectionId;
    this.requireSongSection(song, sectionId);
    const layouts =
      input.layouts === undefined
        ? undefined
        : await this.resolveVisualLayouts(
            organizationId,
            input.layouts,
            song.sections.find((section) => section.id === sectionId)!.steps,
          );
    const slide = await this.prisma.songVisualSlide.update({
      where: { id: visualSlideId },
      data: {
        sectionId,
        name: input.name,
        ...(layouts === undefined
          ? {}
          : { layouts: { deleteMany: {}, create: layouts } }),
      },
      include: { layouts: { orderBy: { target: 'asc' } } },
    });
    await this.publish(
      'song.visual-slide.updated',
      principal.userId,
      organizationId,
      slide.id,
      { title: `${song.title} · ${slide.name}`, sourceId: songId },
    );
    return this.visualSlideToDto(slide);
  }

  async removeVisualSlide(
    principal: AuthPrincipalDto,
    organizationId: string,
    songId: string,
    visualSlideId: string,
  ): Promise<void> {
    await this.requireEditor(principal.userId, organizationId);
    const song = await this.getRecord(organizationId, songId);
    const visualSlide = await this.requireVisualSlide(songId, visualSlideId);
    await this.prisma.songVisualSlide.delete({ where: { id: visualSlide.id } });
    await this.publish(
      'song.visual-slide.deleted',
      principal.userId,
      organizationId,
      visualSlide.id,
      { title: `${song.title} · ${visualSlide.name}`, sourceId: songId },
    );
  }

  async upsertTranslation(
    principal: AuthPrincipalDto,
    organizationId: string,
    songId: string,
    input: SongTranslationInputDto,
  ): Promise<SongTranslationDto> {
    await this.requireEditor(principal.userId, organizationId);
    const song = await this.getRecord(organizationId, songId);
    if (input.locale === song.locale) {
      throw new BadRequestException(
        'Edit the original song for its source language',
      );
    }
    const translation = await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.songTranslation.findUnique({
        where: { songId_locale: { songId, locale: input.locale } },
        select: { id: true },
      });
      if (existing) {
        await transaction.songTranslationSection.deleteMany({
          where: { translationId: existing.id },
        });
        return transaction.songTranslation.update({
          where: { id: existing.id },
          data: {
            title: input.title,
            reviewedAt: new Date(),
            sections: {
              create: input.sections.map((section, position) => ({
                ...section,
                type: this.sectionToDb(section.type),
                position,
              })),
            },
          },
          include: { sections: { orderBy: { position: 'asc' } } },
        });
      }
      return transaction.songTranslation.create({
        data: {
          songId,
          locale: input.locale,
          title: input.title,
          reviewedAt: new Date(),
          sections: {
            create: input.sections.map((section, position) => ({
              ...section,
              type: this.sectionToDb(section.type),
              position,
            })),
          },
        },
        include: { sections: { orderBy: { position: 'asc' } } },
      });
    });
    await this.publish(
      'song.translation.updated',
      principal.userId,
      organizationId,
      translation.id,
      {
        title: `${song.title} · ${input.locale}`,
        sourceId: songId,
      },
    );
    return this.translationToDto(translation);
  }

  async generateTranslation(
    principal: AuthPrincipalDto,
    organizationId: string,
    songId: string,
    input: GenerateSongTranslationRequestDto,
  ): Promise<SongTranslationDto> {
    await this.requireEditor(principal.userId, organizationId);
    const song = await this.getRecord(organizationId, songId);
    if (input.targetLocale === song.locale) {
      throw new BadRequestException(
        'A translation target must differ from the source language',
      );
    }
    if (!song.sections.length) {
      throw new BadRequestException(
        'Add source lyric sections before generating a translation',
      );
    }
    const generated = await this.translations.translateSong({
      sourceLocale: song.locale,
      targetLocale: input.targetLocale,
      title: song.title,
      sections: song.sections,
    });
    const translation = await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.songTranslation.findUnique({
        where: { songId_locale: { songId, locale: input.targetLocale } },
        select: { id: true },
      });
      if (existing) {
        await transaction.songTranslationSection.deleteMany({
          where: { translationId: existing.id },
        });
        return transaction.songTranslation.update({
          where: { id: existing.id },
          data: {
            title: generated.title,
            generatedAt: new Date(),
            reviewedAt: null,
            sections: {
              create: generated.sections.map((section, position) => ({
                ...section,
                type: this.sectionToDb(section.type),
                position,
              })),
            },
          },
          include: { sections: { orderBy: { position: 'asc' } } },
        });
      }
      return transaction.songTranslation.create({
        data: {
          songId,
          locale: input.targetLocale,
          title: generated.title,
          generatedAt: new Date(),
          sections: {
            create: generated.sections.map((section, position) => ({
              ...section,
              type: this.sectionToDb(section.type),
              position,
            })),
          },
        },
        include: { sections: { orderBy: { position: 'asc' } } },
      });
    });
    await this.publish(
      'song.translation.generated',
      principal.userId,
      organizationId,
      translation.id,
      {
        title: `${song.title} · ${input.targetLocale}`,
        sourceId: songId,
      },
    );
    return this.translationToDto(translation);
  }

  async remove(
    principal: AuthPrincipalDto,
    organizationId: string,
    songId: string,
  ): Promise<void> {
    await this.requireEditor(principal.userId, organizationId);
    const song = await this.getRecord(organizationId, songId);
    const usage = await this.prisma.lineupItem.count({
      where: { sourceId: songId, type: 'SONG' },
    });
    if (usage) {
      throw new BadRequestException(
        'A song assigned to a service lineup cannot be deleted',
      );
    }
    await this.prisma.song.delete({ where: { id: songId } });
    await this.publish(
      'song.deleted',
      principal.userId,
      organizationId,
      songId,
      { title: song.title },
    );
  }

  private async getRecord(
    organizationId: string,
    songId: string,
  ): Promise<SongDto> {
    const song = await this.prisma.song.findFirst({
      where: { id: songId, organizationId },
      include: {
        sections: {
          include: { steps: { orderBy: { position: 'asc' } } },
          orderBy: { position: 'asc' },
        },
        arrangements: { orderBy: { name: 'asc' } },
        translations: {
          include: { sections: { orderBy: { position: 'asc' } } },
          orderBy: { locale: 'asc' },
        },
        visualSlides: {
          include: { layouts: { orderBy: { target: 'asc' } } },
          orderBy: { position: 'asc' },
        },
      },
    });
    if (!song) throw new NotFoundException('Song not found');
    return this.toDto(song);
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
    ) {
      throw new ForbiddenException(
        'Song editing requires Owner, Admin, or Leader role',
      );
    }
  }

  private publish(
    type:
      | 'song.created'
      | 'song.updated'
      | 'song.deleted'
      | 'song.translation.updated'
      | 'song.translation.generated'
      | 'song.visual-slide.created'
      | 'song.visual-slide.updated'
      | 'song.visual-slide.deleted',
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

  private sectionToDb(
    type: SongDto['sections'][number]['type'],
  ): 'INTRO' | 'VERSE' | 'PRE_CHORUS' | 'CHORUS' | 'BRIDGE' | 'TAG' | 'ENDING' {
    return (
      {
        Intro: 'INTRO',
        Verse: 'VERSE',
        'Pre-Chorus': 'PRE_CHORUS',
        Chorus: 'CHORUS',
        Bridge: 'BRIDGE',
        Tag: 'TAG',
        Ending: 'ENDING',
      } as const
    )[type];
  }

  private toDto(record: {
    id: string;
    organizationId: string;
    locale: string;
    title: string;
    author: string | null;
    copyright: string | null;
    ccli: string | null;
    key: string | null;
    bpm: number | null;
    createdAt: Date;
    updatedAt: Date;
    sections: readonly {
      id: string;
      type: string;
      label: string;
      content: string;
      position: number;
      steps: readonly {
        id: string;
        sectionId: string;
        position: number;
        content: string;
        lines: string[];
        lineStart: number;
        lineEnd: number;
      }[];
    }[];
    arrangements: readonly { id: string; name: string; sectionIds: string[] }[];
    translations?: readonly {
      id: string;
      songId: string;
      locale: string;
      title: string;
      generatedAt: Date | null;
      reviewedAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
      sections: readonly {
        id: string;
        type: string;
        label: string;
        content: string;
        position: number;
      }[];
    }[];
    visualSlides?: readonly {
      id: string;
      songId: string;
      sectionId: string;
      name: string;
      position: number;
      createdAt: Date;
      updatedAt: Date;
      layouts: readonly {
        id: string;
        songVisualSlideId: string;
        target: string;
        templateId: string | null;
        layout: unknown;
      }[];
    }[];
  }): SongDto {
    const sectionTypes: Record<string, SongDto['sections'][number]['type']> = {
      INTRO: 'Intro',
      VERSE: 'Verse',
      PRE_CHORUS: 'Pre-Chorus',
      CHORUS: 'Chorus',
      BRIDGE: 'Bridge',
      TAG: 'Tag',
      ENDING: 'Ending',
    };
    return SongSchema.parse({
      id: record.id,
      organizationId: record.organizationId,
      locale: record.locale,
      title: record.title,
      ...(record.author ? { author: record.author } : {}),
      ...(record.copyright ? { copyright: record.copyright } : {}),
      ...(record.ccli ? { ccli: record.ccli } : {}),
      ...(record.key ? { key: record.key } : {}),
      ...(record.bpm !== null ? { bpm: record.bpm } : {}),
      sections: record.sections.map((section) => ({
        ...section,
        type: sectionTypes[section.type],
      })),
      arrangements: record.arrangements,
      translations:
        record.translations?.map((translation) =>
          this.translationToDto(translation),
        ) ?? [],
      visualSlides:
        record.visualSlides?.map((slide) => this.visualSlideToDto(slide)) ?? [],
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    });
  }

  private translationToDto(record: {
    id: string;
    songId: string;
    locale: string;
    title: string;
    generatedAt: Date | null;
    reviewedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    sections: readonly {
      id: string;
      type: string;
      label: string;
      content: string;
      position: number;
    }[];
  }): SongTranslationDto {
    const sectionTypes: Record<string, SongDto['sections'][number]['type']> = {
      INTRO: 'Intro',
      VERSE: 'Verse',
      PRE_CHORUS: 'Pre-Chorus',
      CHORUS: 'Chorus',
      BRIDGE: 'Bridge',
      TAG: 'Tag',
      ENDING: 'Ending',
    };
    return {
      id: record.id,
      songId: record.songId,
      locale: record.locale,
      title: record.title,
      sections: record.sections.map((section) => ({
        ...section,
        type: sectionTypes[section.type],
      })),
      generatedAt: record.generatedAt?.toISOString() ?? null,
      reviewedAt: record.reviewedAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private visualSlideToDto(record: {
    id: string;
    songId: string;
    sectionId: string;
    name: string;
    position: number;
    createdAt: Date;
    updatedAt: Date;
    layouts: readonly {
      id: string;
      songVisualSlideId: string;
      target: string;
      templateId: string | null;
      layout: unknown;
    }[];
  }): SongVisualSlideDto {
    return SongVisualSlideSchema.parse({
      id: record.id,
      songId: record.songId,
      sectionId: record.sectionId,
      name: record.name,
      position: record.position,
      layouts: record.layouts.map((layout) => ({
        id: layout.id,
        songVisualSlideId: layout.songVisualSlideId,
        target: layout.target,
        templateId: layout.templateId,
        layout: CanvasLayoutSchema.parse(layout.layout),
      })),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    });
  }

  private async requireVisualSlide(songId: string, visualSlideId: string) {
    const slide = await this.prisma.songVisualSlide.findFirst({
      where: { id: visualSlideId, songId },
    });
    if (!slide) throw new NotFoundException('Song visual slide not found');
    return slide;
  }

  /** A saved original always has a Step 1 for each lyric section in every configured Song view. */
  private async createMissingVisualSlides(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    songId: string,
  ): Promise<void> {
    // A source save must always have a real Settings-owned layout, even for
    // organizations created before the Default global layout existed.
    await Promise.all(
      (
        [
          { name: 'Default', target: 'Main' },
          { name: 'Default · Stage', target: 'Stage' },
          { name: 'Default · Prompter', target: 'Prompter' },
          { name: 'Default · Alpha', target: 'Alpha' },
        ] as const
      ).map((item) =>
        transaction.slideTemplate.upsert({
          where: { organizationId_name: { organizationId, name: item.name } },
          create: {
            organizationId,
            name: item.name,
            kind: 'Default',
            target: item.target,
            layout: defaultCanvasLayout(item.target) as Prisma.InputJsonValue,
          },
          update: { kind: 'Default', target: item.target },
        }),
      ),
    );
    const [sections, existingSlides, templates] = await Promise.all([
      transaction.songSection.findMany({
        where: { songId },
        include: { steps: { orderBy: { position: 'asc' } } },
        orderBy: { position: 'asc' },
      }),
      transaction.songVisualSlide.findMany({
        where: { songId },
        include: { section: true, layouts: true },
      }),
      transaction.slideTemplate.findMany({
        where: { organizationId, kind: { in: ['Default', 'Song'] } },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
    ]);
    // Settings owns which output views exist. Default is a fallback only: an
    // explicitly authored layout for the same output always takes precedence.
    const templatesByTarget = new Map<string, (typeof templates)[number]>();
    for (const template of templates) {
      const current = templatesByTarget.get(template.target);
      if (
        CanvasLayoutSchema.safeParse(template.layout).success &&
        (!current ||
          (isDefaultLayoutName(current.name) &&
            !isDefaultLayoutName(template.name)))
      ) {
        templatesByTarget.set(template.target, template);
      }
    }
    if (!templatesByTarget.size) return;
    // Song views never carry hand-authored per-section pagination. Rebuild the
    // child pages from the global line count whenever lyrics are saved.
    for (const slide of existingSlides) {
      const regenerated = slide.layouts.flatMap((layout) => {
        const template = layout.templateId
          ? templates.find((candidate) => candidate.id === layout.templateId)
          : templatesByTarget.get(layout.target);
        const parsed = CanvasLayoutSchema.safeParse(template?.layout);
        return parsed.success
          ? [
              {
                id: layout.id,
                layout: this.withSongStepPagination(
                  parsed.data,
                  sections.find((section) => section.id === slide.sectionId)
                    ?.steps ?? [],
                ),
              },
            ]
          : [];
      });
      for (const layout of regenerated) {
        await transaction.songVisualSlideLayout.update({
          where: { id: layout.id },
          data: { layout: layout.layout as Prisma.InputJsonValue },
        });
      }
    }
    const visualized = new Set(existingSlides.map((slide) => slide.sectionId));
    let position =
      Math.max(-1, ...existingSlides.map((slide) => slide.position)) + 1;
    for (const section of sections) {
      if (visualized.has(section.id)) continue;
      const selectedTemplates = [...templatesByTarget.values()];
      const generated = selectedTemplates.map((template) =>
        this.withSongStepPagination(
          CanvasLayoutSchema.parse(template.layout),
          section.steps,
        ),
      );
      await transaction.songVisualSlide.create({
        data: {
          songId,
          sectionId: section.id,
          name: section.label,
          position: position++,
          layouts: {
            create: selectedTemplates.map((template, index) => ({
              target: template.target,
              templateId: template.id,
              layout: generated[index] as Prisma.InputJsonValue,
            })),
          },
        },
      });
    }
  }

  private withSongStepPagination(
    layout: import('@worship/shared-dto').CanvasLayoutDto,
    steps: readonly {
      position: number;
      lines: string[];
    }[],
  ): import('@worship/shared-dto').CanvasLayoutDto {
    return applySongStepPagination(layout, steps);
  }

  private requireSongSection(song: SongDto, sectionId: string): void {
    if (!song.sections.some((section) => section.id === sectionId)) {
      throw new BadRequestException(
        'Visual slide section must belong to the song',
      );
    }
  }

  private async resolveStepGenerationRules(
    transaction: Prisma.TransactionClient,
    organizationId: string,
  ): Promise<SongStepGenerationRulesDto> {
    const templates = await transaction.slideTemplate.findMany({
      where: {
        organizationId,
        target: 'Alpha',
        kind: { in: ['Default', 'Song'] },
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    const selected =
      templates.find((template) => !isDefaultLayoutName(template.name)) ??
      templates.find((template) => isDefaultLayoutName(template.name));
    const layout = CanvasLayoutSchema.safeParse(selected?.layout);
    const lyrics = layout.success
      ? layout.data.elements.find((element) => element.type === 'Lyrics')
      : undefined;
    const parsed = SongStepGenerationRulesSchema.safeParse(
      lyrics?.data['stepGenerator'],
    );
    return parsed.success ? parsed.data : DEFAULT_SONG_STEP_GENERATION_RULES;
  }

  private async resolveVisualLayouts(
    organizationId: string,
    layouts: SongVisualSlideInputDto['layouts'],
    steps: readonly { position: number; lines: string[] }[],
  ): Promise<
    {
      target: string;
      templateId: string | null;
      layout: Prisma.InputJsonValue;
    }[]
  > {
    const resolved = await Promise.all(
      layouts.map(async (layout) => {
        if (!layout.templateId) {
          throw new BadRequestException(
            'A song visual slide must reference a view layout from Settings',
          );
        }
        const template = await this.prisma.slideTemplate.findFirst({
          where: { id: layout.templateId, organizationId },
        });
        if (!template)
          throw new BadRequestException(
            'Visual slide template does not belong to the organization',
          );
        if (
          !['Default', 'Song'].includes(template.kind) ||
          template.target !== layout.target
        ) {
          throw new BadRequestException(
            'Visual slide template must be a Default or Song layout for the selected output',
          );
        }
        const base = CanvasLayoutSchema.safeParse(template.layout);
        if (!base.success)
          throw new BadRequestException(
            'The selected view layout is not a valid canvas',
          );
        const canonical = this.withSongStepPagination(base.data, steps);
        return {
          target: layout.target,
          templateId: template.id,
          layout: canonical as Prisma.InputJsonValue,
        };
      }),
    );
    return resolved;
  }
}
