import {
  adaptDefaultCanvasLayout,
  CanvasLayoutSchema,
  defaultCanvasLayout,
  LiveCountdownStateSchema,
  LiveCueSchema,
  LiveSessionSchema,
  LiveStateSchema,
  type AuthPrincipalDto,
  type DomainEventPayloadDto,
  type LiveActionRequestDto,
  type LiveCueDto,
  type LiveCountdownStateDto,
  type LiveSessionDto,
  type LiveStateDto,
  type OutputTarget,
} from '@worship/shared-dto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../../generated/prisma/client';
import { RequestContextService } from '../common/request-context.service';
import { PrismaService } from '../database/prisma.service';
import { EventBusService } from '../events/event-bus.service';
import { SongsService } from '../songs/songs.service';

const STATUS_FROM_DB = {
  PREPARING: 'Preparing',
  READY: 'Ready',
  LIVE: 'Live',
  ENDED: 'Ended',
} as const;

@Injectable()
export class LiveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventBusService,
    private readonly requestContext: RequestContextService,
    private readonly config: ConfigService,
    private readonly songs: SongsService,
  ) {}

  /** Rehydrates active cue scenes after their canonical lineup definition changes. */
  async refreshVisualScenes(
    serviceId: string,
    actorUserId: string,
    organizationId: string,
  ): Promise<void> {
    const sessions = await this.prisma.liveSession.findMany({
      where: { serviceId, status: { in: ['READY', 'LIVE'] } },
      select: {
        id: true,
        serviceId: true,
        preview: true,
        program: true,
        countdown: true,
        operatorMessage: true,
        programOwnerId: true,
        programControlRequestUserId: true,
        programControlRequestedAt: true,
        blackout: true,
        version: true,
        updatedAt: true,
      },
    });
    for (const session of sessions) {
      const state = this.stateFor(session);
      const refresh = async (
        cue: LiveCueDto | null,
      ): Promise<LiveCueDto | null> => {
        if (!cue?.lineupVisualSlideId) return cue;
        try {
          return await this.cueFor(
            serviceId,
            cue.lineupItemId,
            cue.sectionPosition ?? undefined,
            cue.visualSlideId ?? undefined,
            cue.lineupVisualSlideId,
            cue.visualStep,
          );
        } catch (error) {
          if (
            !(error instanceof NotFoundException) &&
            !(error instanceof BadRequestException)
          )
            throw error;
          return this.cueFor(
            serviceId,
            cue.lineupItemId,
            cue.sectionPosition ?? undefined,
            cue.visualSlideId ?? undefined,
            undefined,
            cue.visualStep,
          );
        }
      };
      const [preview, program] = await Promise.all([
        refresh(state.preview),
        refresh(state.program),
      ]);
      if (
        JSON.stringify(preview) === JSON.stringify(state.preview) &&
        JSON.stringify(program) === JSON.stringify(state.program)
      )
        continue;
      const updated = await this.prisma.liveSession.update({
        where: { id: session.id },
        data: {
          preview: preview
            ? (preview as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          program: program
            ? (program as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          version: { increment: 1 },
        },
        select: {
          id: true,
          serviceId: true,
          preview: true,
          program: true,
          countdown: true,
          operatorMessage: true,
          programOwnerId: true,
          programControlRequestUserId: true,
          programControlRequestedAt: true,
          blackout: true,
          version: true,
          updatedAt: true,
        },
      });
      await this.publishState(
        'live.state.updated',
        actorUserId,
        organizationId,
        updated,
      );
    }
  }

  /** Rehydrates active outputs after a reusable Settings layout changes. */
  async refreshTemplateLayout(
    templateId: string,
    actorUserId: string,
    organizationId: string,
  ): Promise<void> {
    const [songReferences, lineupReferences] = await Promise.all([
      this.prisma.songVisualSlideLayout.findMany({
        where: { templateId },
        select: { songVisualSlide: { select: { songId: true } } },
      }),
      this.prisma.lineupVisualSlideLayout.findMany({
        where: { templateId },
        select: {
          lineupVisualSlide: {
            select: { lineupItem: { select: { serviceId: true } } },
          },
        },
      }),
    ]);
    const songIds = new Set(
      songReferences.map((reference) => reference.songVisualSlide.songId),
    );
    const serviceIds = new Set(
      lineupReferences.map(
        (reference) => reference.lineupVisualSlide.lineupItem.serviceId,
      ),
    );
    for (const songId of songIds)
      await this.refreshCueContentForSource(
        songId,
        actorUserId,
        organizationId,
      );
    for (const serviceId of serviceIds)
      await this.refreshVisualScenes(serviceId, actorUserId, organizationId);
  }

  /** Rehydrates active cues that reference one changed library source. */
  async refreshCueContentForSource(
    sourceId: string,
    actorUserId: string,
    organizationId: string,
  ): Promise<void> {
    const sessions = await this.prisma.liveSession.findMany({
      where: {
        status: { in: ['PREPARING', 'READY', 'LIVE'] },
        service: { organizationId },
      },
      select: {
        id: true,
        serviceId: true,
        preview: true,
        program: true,
        countdown: true,
        operatorMessage: true,
        programOwnerId: true,
        programControlRequestUserId: true,
        programControlRequestedAt: true,
        blackout: true,
        version: true,
        updatedAt: true,
      },
    });
    for (const session of sessions) {
      const state = this.stateFor(session);
      const refresh = async (
        cue: LiveCueDto | null,
      ): Promise<LiveCueDto | null> =>
        cue?.sourceId === sourceId
          ? this.cueFor(
              session.serviceId,
              cue.lineupItemId,
              cue.sectionPosition ?? undefined,
              cue.visualSlideId ?? undefined,
              cue.lineupVisualSlideId ?? undefined,
              cue.visualStep,
            )
          : cue;
      const [preview, program] = await Promise.all([
        refresh(state.preview),
        refresh(state.program),
      ]);
      if (
        JSON.stringify(preview) === JSON.stringify(state.preview) &&
        JSON.stringify(program) === JSON.stringify(state.program)
      )
        continue;
      const updated = await this.prisma.liveSession.update({
        where: { id: session.id },
        data: {
          preview:
            preview === null
              ? Prisma.JsonNull
              : (preview as unknown as Prisma.InputJsonValue),
          program:
            program === null
              ? Prisma.JsonNull
              : (program as unknown as Prisma.InputJsonValue),
          version: { increment: 1 },
        },
        select: {
          id: true,
          serviceId: true,
          preview: true,
          program: true,
          countdown: true,
          operatorMessage: true,
          programOwnerId: true,
          programControlRequestUserId: true,
          programControlRequestedAt: true,
          blackout: true,
          version: true,
          updatedAt: true,
        },
      });
      await this.publishState(
        'live.state.updated',
        actorUserId,
        organizationId,
        updated,
      );
    }
  }

  /** Rebuilds or clears a published cue after its own lineup definition changes. */
  async refreshCueContentForLineupItem(
    serviceId: string,
    lineupItemId: string,
    actorUserId: string,
    organizationId: string,
  ): Promise<void> {
    const sessions = await this.prisma.liveSession.findMany({
      where: { serviceId, status: { in: ['READY', 'LIVE'] } },
      select: {
        id: true,
        serviceId: true,
        preview: true,
        program: true,
        countdown: true,
        operatorMessage: true,
        programOwnerId: true,
        programControlRequestUserId: true,
        programControlRequestedAt: true,
        blackout: true,
        version: true,
        updatedAt: true,
      },
    });
    for (const session of sessions) {
      const state = this.stateFor(session);
      const refresh = async (
        cue: LiveCueDto | null,
      ): Promise<LiveCueDto | null> => {
        if (cue?.lineupItemId !== lineupItemId) return cue;
        try {
          return await this.cueFor(
            serviceId,
            lineupItemId,
            cue.sectionPosition ?? undefined,
            cue.visualSlideId ?? undefined,
            cue.lineupVisualSlideId ?? undefined,
            cue.visualStep,
          );
        } catch (error) {
          if (
            !(error instanceof NotFoundException) &&
            !(error instanceof BadRequestException)
          )
            throw error;
          try {
            return await this.cueFor(serviceId, lineupItemId);
          } catch (fallbackError) {
            if (
              fallbackError instanceof NotFoundException ||
              fallbackError instanceof BadRequestException
            )
              return null;
            throw fallbackError;
          }
        }
      };
      const [preview, program] = await Promise.all([
        refresh(state.preview),
        refresh(state.program),
      ]);
      if (
        JSON.stringify(preview) === JSON.stringify(state.preview) &&
        JSON.stringify(program) === JSON.stringify(state.program)
      )
        continue;
      const updated = await this.prisma.liveSession.update({
        where: { id: session.id },
        data: {
          preview:
            preview === null
              ? Prisma.JsonNull
              : (preview as unknown as Prisma.InputJsonValue),
          program:
            program === null
              ? Prisma.JsonNull
              : (program as unknown as Prisma.InputJsonValue),
          version: { increment: 1 },
        },
        select: {
          id: true,
          serviceId: true,
          preview: true,
          program: true,
          countdown: true,
          operatorMessage: true,
          programOwnerId: true,
          programControlRequestUserId: true,
          programControlRequestedAt: true,
          blackout: true,
          version: true,
          updatedAt: true,
        },
      });
      await this.publishState(
        'live.state.updated',
        actorUserId,
        organizationId,
        updated,
      );
    }
  }

  async refreshBibleTranslationContent(
    translationId: string,
    actorUserId: string,
    organizationId: string,
  ): Promise<void> {
    const sessions = await this.prisma.liveSession.findMany({
      where: { status: { in: ['READY', 'LIVE'] }, service: { organizationId } },
      select: {
        id: true,
        serviceId: true,
        preview: true,
        program: true,
        countdown: true,
        operatorMessage: true,
        programOwnerId: true,
        programControlRequestUserId: true,
        programControlRequestedAt: true,
        blackout: true,
        version: true,
        updatedAt: true,
      },
    });
    for (const session of sessions) {
      const state = this.stateFor(session);
      const refresh = async (
        cue: LiveCueDto | null,
      ): Promise<LiveCueDto | null> => {
        if (cue?.type !== 'Bible' || !cue.sourceId) return cue;
        const passage = await this.prisma.biblePassage.findUnique({
          where: { id: cue.sourceId },
          select: { translationId: true },
        });
        return passage?.translationId === translationId
          ? this.cueFor(
              session.serviceId,
              cue.lineupItemId,
              undefined,
              undefined,
              cue.lineupVisualSlideId ?? undefined,
              cue.visualStep,
            )
          : cue;
      };
      const [preview, program] = await Promise.all([
        refresh(state.preview),
        refresh(state.program),
      ]);
      if (
        JSON.stringify(preview) === JSON.stringify(state.preview) &&
        JSON.stringify(program) === JSON.stringify(state.program)
      )
        continue;
      const updated = await this.prisma.liveSession.update({
        where: { id: session.id },
        data: {
          preview:
            preview === null
              ? Prisma.JsonNull
              : (preview as unknown as Prisma.InputJsonValue),
          program:
            program === null
              ? Prisma.JsonNull
              : (program as unknown as Prisma.InputJsonValue),
          version: { increment: 1 },
        },
        select: {
          id: true,
          serviceId: true,
          preview: true,
          program: true,
          countdown: true,
          operatorMessage: true,
          programOwnerId: true,
          programControlRequestUserId: true,
          programControlRequestedAt: true,
          blackout: true,
          version: true,
          updatedAt: true,
        },
      });
      await this.publishState(
        'live.state.updated',
        actorUserId,
        organizationId,
        updated,
      );
    }
  }

  async start(
    principal: AuthPrincipalDto,
    organizationId: string,
    serviceId: string,
  ): Promise<LiveSessionDto> {
    await this.requireOperator(principal.userId, organizationId);
    const service = await this.requireService(organizationId, serviceId);
    const songIds = await this.prisma.lineupItem.findMany({
      where: { serviceId, type: 'SONG', sourceId: { not: null } },
      distinct: ['sourceId'],
      select: { sourceId: true },
    });
    for (const { sourceId } of songIds) {
      if (sourceId) {
        await this.songs.synchronizePresentation(organizationId, sourceId);
        await this.refreshCueContentForSource(
          sourceId,
          principal.userId,
          organizationId,
        );
      }
    }
    const readiness = await this.assessReadiness(organizationId, serviceId);
    if (!readiness.presentation || !readiness.media)
      throw new BadRequestException(
        'Going live requires at least one complete cue and every selected media asset to be available',
      );
    const updated = await this.prisma.$transaction(async (transaction) => {
      await transaction.service.update({
        where: { id: service.id },
        data: {
          status: 'LIVE',
          teamReady: readiness.team,
          mediaReady: readiness.media,
          presentationReady: readiness.presentation,
          outputsReady: readiness.outputs,
        },
      });
      const active = await transaction.liveSession.findFirst({
        where: { serviceId, status: { in: ['PREPARING', 'READY', 'LIVE'] } },
        orderBy: { createdAt: 'desc' },
      });
      return active
        ? transaction.liveSession.update({
            where: { id: active.id },
            data: {
              status: 'LIVE',
              programOwnerId: active.programOwnerId ?? principal.userId,
              startedAt: active.startedAt ?? new Date(),
              version: { increment: 1 },
            },
          })
        : transaction.liveSession.create({
            data: {
              serviceId,
              status: 'LIVE',
              programOwnerId: principal.userId,
              startedAt: new Date(),
            },
          });
    });
    await this.publish(
      'service.updated',
      principal.userId,
      organizationId,
      service.id,
      {
        serviceId: service.id,
        title: service.title,
      },
    );
    await this.publishState(
      'live.session.started',
      principal.userId,
      organizationId,
      updated,
    );
    return this.toDto(updated);
  }

  async get(userId: string, sessionId: string): Promise<LiveSessionDto> {
    const session = await this.requireSession(sessionId);
    await this.requireMembership(userId, session.service.organizationId);
    return this.toDto(session);
  }

  async act(
    principal: AuthPrincipalDto,
    sessionId: string,
    input: LiveActionRequestDto,
  ): Promise<LiveSessionDto> {
    const session = await this.requireSession(sessionId);
    await this.requireOperator(
      principal.userId,
      session.service.organizationId,
    );
    if (session.status !== 'LIVE' && input.action !== 'ClaimProgram') {
      throw new BadRequestException(
        'Live Session must be started before this action',
      );
    }

    if (input.action === 'ClaimProgram') {
      if (
        session.programOwnerId &&
        session.programOwnerId !== principal.userId
      ) {
        throw new ConflictException(
          'Program control is currently owned by another operator',
        );
      }
      const updated = await this.prisma.liveSession.update({
        where: { id: session.id },
        data: { programOwnerId: principal.userId, version: { increment: 1 } },
      });
      await this.publishState(
        'live.state.updated',
        principal.userId,
        session.service.organizationId,
        updated,
      );
      return this.toDto(updated);
    }

    if (input.action === 'RequestProgramControl') {
      if (
        !session.programOwnerId ||
        session.programOwnerId === principal.userId
      ) {
        const updated = await this.prisma.liveSession.update({
          where: { id: session.id },
          data: {
            programOwnerId: principal.userId,
            programControlRequestUserId: null,
            programControlRequestedAt: null,
            version: { increment: 1 },
          },
        });
        await this.publishState(
          'live.state.updated',
          principal.userId,
          session.service.organizationId,
          updated,
        );
        return this.toDto(updated);
      }
      if (session.programControlRequestUserId) {
        throw new ConflictException(
          'A Program control request is already pending',
        );
      }
      const updated = await this.prisma.liveSession.update({
        where: { id: session.id },
        data: {
          programControlRequestUserId: principal.userId,
          programControlRequestedAt: new Date(),
          version: { increment: 1 },
        },
      });
      await this.publishState(
        'live.state.updated',
        principal.userId,
        session.service.organizationId,
        updated,
      );
      await this.publish(
        'live.program-control.requested',
        principal.userId,
        session.service.organizationId,
        session.id,
        {
          sessionId: session.id,
          targetUserId: session.programOwnerId,
          title: 'Program control requested',
        },
      );
      return this.toDto(updated);
    }

    if (session.programOwnerId !== principal.userId) {
      throw new ForbiddenException(
        'Only the Program Owner can control this Live Session',
      );
    }

    if (
      input.action === 'AcceptProgramControl' ||
      input.action === 'RejectProgramControl'
    ) {
      const requestedUserId = session.programControlRequestUserId;
      if (!requestedUserId)
        throw new BadRequestException('No Program control request is pending');
      const accepted = input.action === 'AcceptProgramControl';
      const updated = await this.prisma.liveSession.update({
        where: { id: session.id },
        data: {
          ...(accepted ? { programOwnerId: requestedUserId } : {}),
          programControlRequestUserId: null,
          programControlRequestedAt: null,
          version: { increment: 1 },
        },
      });
      await this.publishState(
        'live.state.updated',
        principal.userId,
        session.service.organizationId,
        updated,
      );
      await this.publish(
        accepted
          ? 'live.program-control.approved'
          : 'live.program-control.rejected',
        principal.userId,
        session.service.organizationId,
        session.id,
        {
          sessionId: session.id,
          targetUserId: requestedUserId,
          title: accepted
            ? 'Program control granted'
            : 'Program control request declined',
        },
      );
      return this.toDto(updated);
    }

    if (input.action === 'ReleaseProgram') {
      const updated = await this.prisma.liveSession.update({
        where: { id: session.id },
        data: { programOwnerId: null, version: { increment: 1 } },
      });
      await this.publishState(
        'live.state.updated',
        principal.userId,
        session.service.organizationId,
        updated,
      );
      return this.toDto(updated);
    }

    if (input.action === 'End') {
      const updated = await this.prisma.$transaction(async (transaction) => {
        await transaction.service.update({
          where: { id: session.serviceId },
          data: { status: 'COMPLETED' },
        });
        return transaction.liveSession.update({
          where: { id: session.id },
          data: {
            status: 'ENDED',
            endedAt: new Date(),
            programOwnerId: null,
            version: { increment: 1 },
          },
        });
      });
      await this.publishState(
        'live.session.ended',
        principal.userId,
        session.service.organizationId,
        updated,
      );
      return this.toDto(updated);
    }

    const data = await this.actionData(session, input);
    const updated = await this.prisma.liveSession.update({
      where: { id: session.id },
      data: { ...data, version: { increment: 1 } },
    });
    await this.publishState(
      'live.state.updated',
      principal.userId,
      session.service.organizationId,
      updated,
    );
    return this.toDto(updated);
  }

  async getOutputState(
    sessionId: string,
    outputAccessKey: string,
  ): Promise<LiveStateDto> {
    const session = await this.prisma.liveSession.findFirst({
      where: { id: sessionId, outputAccessKey },
    });
    if (!session) throw new NotFoundException('Live output not found');
    return this.stateFor(session);
  }

  /** Called by the in-process scheduler; transition is optimistic by version. */
  async completeDueCountdowns(): Promise<void> {
    const sessions = await this.prisma.liveSession.findMany({
      where: { status: 'LIVE' },
      select: {
        id: true,
        serviceId: true,
        preview: true,
        program: true,
        countdown: true,
        operatorMessage: true,
        programOwnerId: true,
        programControlRequestUserId: true,
        programControlRequestedAt: true,
        blackout: true,
        version: true,
        updatedAt: true,
        service: { select: { organizationId: true } },
      },
    });
    const now = Date.now();
    for (const session of sessions) {
      const countdown = this.currentCountdown(session);
      if (
        countdown?.status !== 'Running' ||
        !countdown.endsAt ||
        new Date(countdown.endsAt).getTime() > now
      )
        continue;
      let preview = session.preview;
      let program = session.program;
      if (countdown.autoAdvance) {
        const lineup = await this.prisma.lineupItem.findMany({
          where: { serviceId: session.serviceId },
          orderBy: { position: 'asc' },
        });
        const state = this.stateFor(session);
        const countdownIsOnProgram =
          state.program?.type === 'Countdown' &&
          state.program.sourceId === countdown.countdownId;
        const currentId = countdownIsOnProgram
          ? state.program!.lineupItemId
          : (state.preview?.lineupItemId ?? state.program?.lineupItemId);
        const index = lineup.findIndex((item) => item.id === currentId);
        const next =
          lineup[Math.min(lineup.length - 1, Math.max(0, index + 1))];
        if (next && next.id !== currentId) {
          const nextCue = (await this.cueFor(
            session.serviceId,
            next.id,
          )) as unknown as Prisma.JsonValue;
          if (countdownIsOnProgram) {
            program = nextCue;
            const following = lineup[Math.min(lineup.length - 1, index + 2)];
            preview =
              following && following.id !== next.id
                ? ((await this.cueFor(
                    session.serviceId,
                    following.id,
                  )) as unknown as Prisma.JsonValue)
                : nextCue;
          } else {
            preview = nextCue;
          }
        }
      }
      const completed = {
        ...countdown,
        status: 'Idle',
        remainingSeconds: 0,
        startedAt: null,
        endsAt: null,
      };
      const result = await this.prisma.liveSession.updateMany({
        where: { id: session.id, version: session.version },
        data: {
          countdown: completed as unknown as Prisma.InputJsonValue,
          preview:
            preview === null
              ? Prisma.JsonNull
              : (preview as unknown as Prisma.InputJsonValue),
          program:
            program === null
              ? Prisma.JsonNull
              : (program as unknown as Prisma.InputJsonValue),
          version: { increment: 1 },
        },
      });
      if (!result.count) continue;
      const updated = await this.prisma.liveSession.findUniqueOrThrow({
        where: { id: session.id },
        select: {
          id: true,
          serviceId: true,
          preview: true,
          program: true,
          countdown: true,
          operatorMessage: true,
          programOwnerId: true,
          programControlRequestUserId: true,
          programControlRequestedAt: true,
          blackout: true,
          version: true,
          updatedAt: true,
        },
      });
      await this.events.publish({
        type: 'live.state.updated',
        organizationId: session.service.organizationId,
        actorUserId: null,
        subjectId: session.id,
        payload: { sessionId: session.id, liveState: this.stateFor(updated) },
        correlationId: 'system:countdown',
      });
    }
  }

  private async actionData(
    session: Awaited<ReturnType<LiveService['requireSession']>>,
    input: LiveActionRequestDto,
  ) {
    if (input.action === 'SendMessage') {
      return {
        operatorMessage: {
          body: input.message!,
          sentAt: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      };
    }
    if (input.action === 'StartCountdown') {
      return {
        countdown: await this.startCountdownState(
          session.service.organizationId,
          input.countdownId!,
          input.countdownTargets ?? ['Stage', 'Prompter'],
        ),
      };
    }
    if (input.action === 'PauseCountdown') {
      const countdown = this.currentCountdown(session);
      if (!countdown) throw new BadRequestException('No countdown is active');
      const remainingSeconds =
        countdown.status === 'Running' && countdown.endsAt
          ? Math.max(
              0,
              Math.ceil(
                (new Date(countdown.endsAt).getTime() - Date.now()) / 1_000,
              ),
            )
          : countdown.remainingSeconds;
      return {
        countdown: {
          ...countdown,
          status: 'Paused',
          remainingSeconds,
          startedAt: null,
          endsAt: null,
        } as unknown as Prisma.InputJsonValue,
      };
    }
    if (input.action === 'ResumeCountdown') {
      const countdown = this.currentCountdown(session);
      if (!countdown || countdown.status !== 'Paused')
        throw new BadRequestException('No paused countdown is active');
      const now = new Date();
      return {
        countdown: {
          ...countdown,
          status: 'Running',
          startedAt: now.toISOString(),
          endsAt: new Date(
            now.getTime() + countdown.remainingSeconds * 1_000,
          ).toISOString(),
        } as unknown as Prisma.InputJsonValue,
      };
    }
    if (input.action === 'ResetCountdown') {
      const countdown = this.currentCountdown(session);
      if (!countdown) throw new BadRequestException('No countdown is active');
      const definition = await this.prisma.countdownDefinition.findUnique({
        where: { id: countdown.countdownId },
      });
      if (!definition) throw new NotFoundException('Countdown not found');
      const remainingSeconds =
        definition.mode === 'TARGET_TIME'
          ? Math.max(
              0,
              Math.ceil((definition.targetAt!.getTime() - Date.now()) / 1_000),
            )
          : (definition.durationSeconds ?? 0);
      return {
        countdown: {
          countdownId: definition.id,
          name: definition.name,
          status: 'Idle',
          remainingSeconds,
          startedAt: null,
          endsAt: null,
          autoAdvance: definition.autoAdvance,
          visibleOn: countdown.visibleOn,
        } as unknown as Prisma.InputJsonValue,
      };
    }
    if (input.action === 'Preview') {
      return {
        preview: (await this.cueFor(
          session.serviceId,
          input.lineupItemId!,
          input.sectionPosition,
          input.visualSlideId,
          input.lineupVisualSlideId,
          input.visualStep,
        )) as unknown as Prisma.InputJsonValue,
      };
    }
    if (input.action === 'Take') {
      if (!session.preview) throw new BadRequestException('Preview is empty');
      const cue = LiveCueSchema.parse(session.preview);
      const activeCountdown = this.currentCountdown(session);
      return {
        program: session.preview as Prisma.InputJsonValue,
        blackout: false,
        ...(cue.type === 'Countdown' &&
        cue.sourceId &&
        (activeCountdown?.countdownId !== cue.sourceId ||
          activeCountdown.status !== 'Running')
          ? {
              countdown: await this.startCountdownState(
                session.service.organizationId,
                cue.sourceId,
                ['Stage', 'Prompter'],
              ),
            }
          : {}),
      };
    }
    if (input.action === 'Clear')
      return { program: Prisma.JsonNull, blackout: false };
    if (input.action === 'Blackout') return { blackout: true };
    if (input.action === 'Unblackout') return { blackout: false };
    if (input.action === 'Next' || input.action === 'Previous') {
      const items = await this.prisma.lineupItem.findMany({
        where: { serviceId: session.serviceId },
        orderBy: { position: 'asc' },
      });
      if (!items.length)
        throw new BadRequestException('The service lineup is empty');
      const currentId =
        this.stateFor(session).preview?.lineupItemId ??
        this.stateFor(session).program?.lineupItemId;
      const currentIndex = Math.max(
        0,
        items.findIndex((item) => item.id === currentId),
      );
      const offset = input.action === 'Next' ? 1 : -1;
      const target =
        items[Math.min(items.length - 1, Math.max(0, currentIndex + offset))];
      return {
        preview: (await this.cueFor(
          session.serviceId,
          target.id,
        )) as unknown as Prisma.InputJsonValue,
      };
    }
    throw new BadRequestException(`Unsupported Live action: ${input.action}`);
  }

  private async cueFor(
    serviceId: string,
    lineupItemId: string,
    sectionPosition?: number,
    visualSlideId?: string,
    lineupVisualSlideId?: string,
    visualStep = 0,
  ): Promise<LiveCueDto> {
    const item = await this.prisma.lineupItem.findFirst({
      where: { id: lineupItemId, serviceId },
      include: {
        service: { select: { organizationId: true } },
        visualSlides: {
          include: { layouts: { orderBy: { target: 'asc' } } },
          orderBy: { position: 'asc' },
        },
      },
    });
    if (!item) throw new NotFoundException('Lineup item not found');
    const cueType = this.lineupType(item.type);
    const defaultNames = [
      'Default',
      'Default · Stage',
      'Default · Prompter',
      'Default · Alpha',
    ];
    const storedDefaults = await this.prisma.slideTemplate.findMany({
      where: {
        organizationId: item.service.organizationId,
        name: { in: defaultNames },
      },
    });
    const targets: readonly OutputTarget[] = [
      'Main',
      'Stage',
      'Prompter',
      'Alpha',
    ];
    const defaultLayouts = targets.map((target) => {
      const stored = storedDefaults.find(
        (template) => template.target === target,
      );
      const parsed = CanvasLayoutSchema.safeParse(stored?.layout);
      return {
        target,
        layout: adaptDefaultCanvasLayout(
          parsed.success ? parsed.data : defaultCanvasLayout(target),
          cueType,
        ),
      };
    });
    const song =
      item.type === 'SONG' && item.sourceId
        ? await this.prisma.song.findUnique({
            where: { id: item.sourceId },
            include: {
              sections: {
                include: { steps: { orderBy: { position: 'asc' } } },
                orderBy: { position: 'asc' },
              },
              visualSlides: {
                include: { layouts: { orderBy: { target: 'asc' } } },
                orderBy: { position: 'asc' },
              },
            },
          })
        : null;
    const songTranslation =
      song && item.contentLocale && item.contentLocale !== song.locale
        ? await this.prisma.songTranslation.findUnique({
            where: {
              songId_locale: { songId: song.id, locale: item.contentLocale },
            },
            include: { sections: { orderBy: { position: 'asc' } } },
          })
        : null;
    const passage =
      item.type === 'BIBLE' && item.sourceId
        ? await this.prisma.biblePassage.findUnique({
            where: { id: item.sourceId },
            include: {
              translation: { select: { abbreviation: true, locale: true } },
            },
          })
        : null;
    const verses = passage
      ? await this.prisma.bibleVerse.findMany({
          where: {
            translationId: passage.translationId,
            book: passage.book,
            chapter: passage.chapter,
            verse: { gte: passage.verseStart, lte: passage.verseEnd },
          },
          orderBy: { verse: 'asc' },
        })
      : [];
    const passageTranslation =
      passage &&
      item.contentLocale &&
      item.contentLocale !== passage.translation.locale
        ? await this.prisma.biblePassageTranslation.findUnique({
            where: {
              passageId_locale: {
                passageId: passage.id,
                locale: item.contentLocale,
              },
            },
          })
        : null;
    const asset =
      (item.type === 'IMAGE' ||
        item.type === 'VIDEO' ||
        item.type === 'AUDIO') &&
      item.sourceId
        ? await this.prisma.mediaAsset.findUnique({
            where: { id: item.sourceId },
          })
        : null;
    const countdown =
      item.type === 'COUNTDOWN' && item.sourceId
        ? await this.prisma.countdownDefinition.findUnique({
            where: { id: item.sourceId },
          })
        : null;
    const slide =
      item.type === 'SLIDE' && item.sourceId
        ? await this.prisma.slideDocument.findUnique({
            where: { id: item.sourceId },
            include: { template: true },
          })
        : null;
    const selectedVisualSlide =
      visualSlideId === undefined
        ? null
        : (song?.visualSlides.find((slide) => slide.id === visualSlideId) ??
          null);
    if (visualSlideId !== undefined && !selectedVisualSlide) {
      throw new BadRequestException('Song visual slide not found for this cue');
    }
    const selectedLineupVisualSlide =
      lineupVisualSlideId === undefined
        ? null
        : (item.visualSlides.find(
            (slide) => slide.id === lineupVisualSlideId,
          ) ?? null);
    if (lineupVisualSlideId !== undefined && !selectedLineupVisualSlide) {
      throw new BadRequestException('Visual scene not found for this cue');
    }
    const sourceSection = selectedVisualSlide
      ? (song?.sections.find(
          (section) => section.id === selectedVisualSlide.sectionId,
        ) ?? null)
      : null;
    const songSections = songTranslation?.sections ?? song?.sections ?? [];
    const requestedSectionPosition = sourceSection?.position ?? sectionPosition;
    const activeSection =
      requestedSectionPosition === undefined
        ? null
        : (songSections.find(
            (section) => section.position === requestedSectionPosition,
          ) ?? null);
    if (requestedSectionPosition !== undefined && song && !activeSection) {
      throw new BadRequestException('Song section not found');
    }
    if (requestedSectionPosition !== undefined && !song) {
      throw new BadRequestException('Only song cues support section preview');
    }
    return LiveCueSchema.parse({
      lineupItemId: item.id,
      type: cueType,
      title: songTranslation?.title ?? item.title,
      sourceId: item.sourceId,
      notes: item.notes,
      sectionPosition: activeSection?.position ?? null,
      visualSlideId: selectedVisualSlide?.id ?? null,
      visualStep,
      lineupVisualSlideId: selectedLineupVisualSlide?.id ?? null,
      content: {
        visualSlides: item.visualSlides.map((scene) => ({
          id: scene.id,
          name: scene.name,
          position: scene.position,
          layouts: scene.layouts.map((layout) => ({
            target: layout.target,
            layout: layout.layout,
          })),
        })),
        activeVisualSlide: selectedLineupVisualSlide
          ? {
              id: selectedLineupVisualSlide.id,
              layouts: selectedLineupVisualSlide.layouts.map((layout) => ({
                target: layout.target,
                layout: layout.layout,
              })),
            }
          : selectedVisualSlide || slide
            ? null
            : { id: 'default', layouts: defaultLayouts },
        ...(song
          ? {
              song: {
                id: song.id,
                title: songTranslation?.title ?? song.title,
                locale: item.contentLocale ?? song.locale,
                sections: songSections.map((section) => {
                  const source = song.sections.find(
                    (candidate) => candidate.position === section.position,
                  );
                  const localizedLines = section.content
                    .split(/\r?\n/)
                    .map((line) => line.trim())
                    .filter(Boolean);
                  return {
                    id: section.id,
                    label: section.label,
                    type: this.sectionType(section.type),
                    content: section.content,
                    position: section.position,
                    steps:
                      source?.steps.map((step) => {
                        const lines = songTranslation
                          ? localizedLines.slice(
                              step.lineStart - 1,
                              step.lineEnd,
                            )
                          : step.lines;
                        return {
                          position: step.position,
                          content: lines.join('\n'),
                          lines,
                        };
                      }) ?? [],
                  };
                }),
                activeSection: activeSection
                  ? {
                      label: activeSection.label,
                      type: this.sectionType(activeSection.type),
                      content: activeSection.content,
                      position: activeSection.position,
                    }
                  : null,
                visualSlides: song.visualSlides.map((slide) => ({
                  id: slide.id,
                  sectionId: slide.sectionId,
                  name: slide.name,
                  position: slide.position,
                  layouts: slide.layouts.map((layout) => ({
                    target: layout.target,
                    layout: layout.layout,
                  })),
                })),
                activeVisualSlide: selectedVisualSlide
                  ? {
                      id: selectedVisualSlide.id,
                      sectionId: selectedVisualSlide.sectionId,
                      layouts: selectedVisualSlide.layouts.map((layout) => ({
                        target: layout.target,
                        layout: layout.layout,
                      })),
                    }
                  : null,
              },
            }
          : passage
            ? {
                bible: {
                  passageId: passage.id,
                  reference: passage.reference,
                  book: passage.book,
                  chapter: passage.chapter,
                  translation: passageTranslation
                    ? `${passage.translation.abbreviation} · ${passageTranslation.locale}`
                    : passage.translation.abbreviation,
                  sourceTranslation: passage.translation.abbreviation,
                  locale: item.contentLocale ?? passage.translation.locale,
                  verses: passageTranslation
                    ? (passageTranslation.verses as unknown as {
                        verse: number;
                        text: string;
                      }[])
                    : verses.map((verse) => ({
                        verse: verse.verse,
                        text: verse.text,
                      })),
                },
              }
            : asset
              ? {
                  media: {
                    assetId: asset.id,
                    kind: asset.kind,
                    url: asset.url,
                    thumbnailUrl: asset.thumbnailUrl,
                    durationMs: asset.durationMs,
                  },
                }
              : slide
                ? {
                    slide: {
                      slideId: slide.id,
                      content: slide.content,
                      templateKind: slide.template?.kind ?? null,
                    },
                  }
                : countdown
                  ? {
                      countdown: {
                        countdownId: countdown.id,
                        mode: countdown.mode,
                        durationSeconds: countdown.durationSeconds,
                        targetAt: countdown.targetAt?.toISOString() ?? null,
                        autoAdvance: countdown.autoAdvance,
                      },
                    }
                  : { text: item.notes ?? item.title }),
      },
    });
  }

  private async requireSession(sessionId: string) {
    const session = await this.prisma.liveSession.findUnique({
      where: { id: sessionId },
      include: {
        service: { select: { id: true, organizationId: true, title: true } },
      },
    });
    if (!session) throw new NotFoundException('Live Session not found');
    return session;
  }

  private async startCountdownState(
    organizationId: string,
    countdownId: string,
    visibleOn: readonly ('Main' | 'Stage' | 'Prompter' | 'Alpha')[],
  ): Promise<Prisma.InputJsonValue> {
    const definition = await this.prisma.countdownDefinition.findFirst({
      where: { id: countdownId, organizationId },
    });
    if (!definition) throw new NotFoundException('Countdown not found');
    const now = new Date();
    const endsAt =
      definition.mode === 'TARGET_TIME'
        ? definition.targetAt
        : new Date(now.getTime() + (definition.durationSeconds ?? 0) * 1_000);
    return {
      countdownId: definition.id,
      name: definition.name,
      status: 'Running',
      remainingSeconds: Math.max(
        0,
        Math.ceil((endsAt!.getTime() - now.getTime()) / 1_000),
      ),
      startedAt: now.toISOString(),
      endsAt: endsAt!.toISOString(),
      autoAdvance: definition.autoAdvance,
      visibleOn,
    } as unknown as Prisma.InputJsonValue;
  }

  private async requireService(organizationId: string, serviceId: string) {
    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, organizationId },
      select: { id: true, title: true },
    });
    if (!service) throw new NotFoundException('Service not found');
    return service;
  }

  /**
   * Preparation is deliberately a read-only validation of the configured
   * sources followed by persisted readiness flags; it never probes remote
   * media URLs or renders content server-side.
   */
  private async assessReadiness(
    organizationId: string,
    serviceId: string,
  ): Promise<{
    team: boolean;
    media: boolean;
    presentation: boolean;
    outputs: boolean;
  }> {
    const [lineup, assignments] = await Promise.all([
      this.prisma.lineupItem.findMany({
        where: { serviceId },
        select: { type: true, sourceId: true },
      }),
      this.prisma.serviceTeamAssignment.findMany({
        where: { serviceId },
        select: { status: true },
      }),
    ]);
    const sourceRequired = new Set([
      'SONG',
      'BIBLE',
      'SLIDE',
      'IMAGE',
      'VIDEO',
      'AUDIO',
      'COUNTDOWN',
    ]);
    const completeLineup =
      lineup.length > 0 &&
      lineup.every(
        (item) => !sourceRequired.has(item.type) || Boolean(item.sourceId),
      );
    const mediaIds = [
      ...new Set(
        lineup
          .filter(
            (item) =>
              ['IMAGE', 'VIDEO', 'AUDIO'].includes(item.type) && item.sourceId,
          )
          .map((item) => item.sourceId!),
      ),
    ];
    const mediaCount = mediaIds.length
      ? await this.prisma.mediaAsset.count({
          where: { organizationId, id: { in: mediaIds }, url: { not: '' } },
        })
      : 0;
    return {
      team:
        assignments.length > 0 &&
        assignments.every((assignment) => assignment.status === 'ACCEPTED'),
      media: mediaCount === mediaIds.length,
      presentation: completeLineup,
      outputs: true,
    };
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

  private async requireOperator(
    userId: string,
    organizationId: string,
  ): Promise<void> {
    const roles = await this.requireMembership(userId, organizationId);
    if (
      !roles.some((role) =>
        ['OWNER', 'ADMIN', 'LEADER', 'OPERATOR'].includes(role),
      )
    ) {
      throw new ForbiddenException(
        'Live control requires Owner, Admin, Leader, or Operator role',
      );
    }
  }

  private stateFor(record: {
    id: string;
    serviceId: string;
    preview: unknown;
    program: unknown;
    countdown: unknown;
    operatorMessage: unknown;
    programOwnerId: string | null;
    programControlRequestUserId: string | null;
    programControlRequestedAt: Date | null;
    blackout: boolean;
    version: number;
    updatedAt: Date;
  }): LiveStateDto {
    return LiveStateSchema.parse({
      sessionId: record.id,
      serviceId: record.serviceId,
      preview:
        record.preview === null ? null : LiveCueSchema.parse(record.preview),
      program:
        record.program === null ? null : LiveCueSchema.parse(record.program),
      programOwnerId: record.programOwnerId,
      blackout: record.blackout,
      programControlRequest:
        record.programControlRequestUserId && record.programControlRequestedAt
          ? {
              userId: record.programControlRequestUserId,
              requestedAt: record.programControlRequestedAt.toISOString(),
            }
          : null,
      countdown: record.countdown
        ? LiveCountdownStateSchema.parse(record.countdown)
        : null,
      operatorMessage:
        record.operatorMessage as LiveStateDto['operatorMessage'],
      version: record.version,
      updatedAt: record.updatedAt.toISOString(),
    });
  }

  private toDto(record: {
    id: string;
    serviceId: string;
    outputAccessKey: string;
    status: string;
    preview: unknown;
    program: unknown;
    countdown: unknown;
    operatorMessage: unknown;
    programOwnerId: string | null;
    programControlRequestUserId: string | null;
    programControlRequestedAt: Date | null;
    blackout: boolean;
    version: number;
    startedAt: Date | null;
    endedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): LiveSessionDto {
    const appUrl = this.config.getOrThrow<string>('APP_URL').replace(/\/$/, '');
    const output = (
      kind: 'preview' | 'main' | 'stage' | 'prompter' | 'alpha',
    ) =>
      `${appUrl}/live/${record.id}/${kind}?key=${encodeURIComponent(record.outputAccessKey)}`;
    return LiveSessionSchema.parse({
      id: record.id,
      serviceId: record.serviceId,
      status: STATUS_FROM_DB[record.status as keyof typeof STATUS_FROM_DB],
      state: this.stateFor(record),
      outputUrls: {
        control: `${appUrl}/live/${record.id}/control`,
        preview: output('preview'),
        main: output('main'),
        stage: output('stage'),
        prompter: output('prompter'),
        alpha: output('alpha'),
      },
      startedAt: record.startedAt?.toISOString() ?? null,
      endedAt: record.endedAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    });
  }

  private async publishState(
    type: 'live.session.started' | 'live.session.ended' | 'live.state.updated',
    actorUserId: string,
    organizationId: string,
    session: {
      id: string;
      serviceId: string;
      preview: unknown;
      program: unknown;
      countdown: unknown;
      operatorMessage: unknown;
      programOwnerId: string | null;
      programControlRequestUserId: string | null;
      programControlRequestedAt: Date | null;
      blackout: boolean;
      version: number;
      updatedAt: Date;
    },
  ): Promise<void> {
    const liveState = this.stateFor(session);
    const payload: DomainEventPayloadDto = { sessionId: session.id, liveState };
    await this.publish(type, actorUserId, organizationId, session.id, payload);
  }

  private publish(
    type:
      | 'service.updated'
      | 'live.session.prepared'
      | 'live.session.started'
      | 'live.session.ended'
      | 'live.state.updated'
      | 'live.program-control.requested'
      | 'live.program-control.approved'
      | 'live.program-control.rejected',
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

  private lineupType(value: string): LiveCueDto['type'] {
    return {
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
    }[value] as LiveCueDto['type'];
  }

  private sectionType(value: string): string {
    return (
      {
        INTRO: 'Intro',
        VERSE: 'Verse',
        PRE_CHORUS: 'Pre-Chorus',
        CHORUS: 'Chorus',
        BRIDGE: 'Bridge',
        TAG: 'Tag',
        ENDING: 'Ending',
      }[value] ?? value
    );
  }

  private currentCountdown(record: {
    countdown: unknown;
  }): LiveCountdownStateDto | null {
    return record.countdown
      ? LiveCountdownStateSchema.parse(record.countdown)
      : null;
  }
}
