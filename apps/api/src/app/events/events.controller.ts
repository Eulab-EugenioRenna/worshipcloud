import {
  EventStreamQuerySchema,
  type DomainEventDto,
  type EventStreamQueryDto,
} from '@worship/shared-dto';
import {
  Controller,
  ForbiddenException,
  MessageEvent,
  Query,
  Sse,
} from '@nestjs/common';
import {
  filter,
  from,
  Observable,
  switchMap,
  take,
  timer,
} from 'rxjs';
import { CurrentPrincipal } from '../auth/current-principal.decorator';
import type { AuthPrincipalDto } from '@worship/shared-dto';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PrismaService } from '../database/prisma.service';
import { EventBusService } from './event-bus.service';
import { DomainEventSchema } from '@worship/shared-dto';

@Controller('events')
export class EventsController {
  constructor(
    private readonly events: EventBusService,
    private readonly prisma: PrismaService,
  ) {}

  @Sse('stream')
  async stream(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Query(new ZodValidationPipe(EventStreamQuerySchema))
    query: EventStreamQueryDto,
  ): Promise<Observable<MessageEvent>> {
    if (!(await this.isAuthorized(principal, query.organizationId))) {
      throw new ForbiddenException('Organization access denied');
    }

    const authorizationLost$ = timer(5000, 5000).pipe(
      switchMap(() =>
        from(this.isAuthorized(principal, query.organizationId)),
      ),
      filter((authorized) => !authorized),
      take(1),
    );

    return new Observable<MessageEvent>((subscriber) => {
      const buffered: DomainEventDto[] = [];
      const replayed = new Set<string>();
      let replayComplete = false;
      const emit = (event: DomainEventDto) => subscriber.next({ id: event.id, data: event });
      // Subscribe before querying Postgres: events published during replay are buffered, not lost.
      const eventsSubscription = this.events.events$
        .pipe(filter((event) => event.organizationId === query.organizationId))
        .subscribe((event) => replayComplete ? emit(event) : buffered.push(event));
      const authorizationSubscription = authorizationLost$.subscribe({
        next: () => subscriber.complete(),
        error: (error) => subscriber.error(error),
      });
      void this.historyAfter(query).then((history) => {
        for (const event of history) {
          replayed.add(event.id);
          emit(event);
        }
        replayComplete = true;
        for (const event of buffered) if (!replayed.has(event.id)) emit(event);
        buffered.length = 0;
        replayed.clear();
      }).catch((error: unknown) => subscriber.error(error));
      return () => {
        eventsSubscription.unsubscribe();
        authorizationSubscription.unsubscribe();
      };
    });
  }

  private async historyAfter(query: EventStreamQueryDto): Promise<DomainEventDto[]> {
    const afterEvent = query.afterId
      ? await this.prisma.domainEvent.findFirst({
          where: { id: query.afterId, organizationId: query.organizationId },
          select: { id: true, occurredAt: true },
        })
      : null;
    const after = afterEvent?.occurredAt ?? (query.after ? new Date(query.after) : null);
    if (!after) return [];
    const history = await this.prisma.domainEvent.findMany({
      where: {
        organizationId: query.organizationId,
        ...(afterEvent
          ? { OR: [{ occurredAt: { gt: after } }, { occurredAt: after, id: { gt: afterEvent.id } }] }
          : { occurredAt: { gt: after } }),
      },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    });
    return history.map((event) => DomainEventSchema.parse({ ...event, occurredAt: event.occurredAt.toISOString() }));
  }

  private async isAuthorized(
    principal: AuthPrincipalDto,
    organizationId: string,
  ): Promise<boolean> {
    const session = await this.prisma.authSession.findFirst({
      where: {
        id: principal.sessionId,
        userId: principal.userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        user: {
          active: true,
          memberships: { some: { organizationId } },
        },
      },
      select: { id: true },
    });
    return Boolean(session);
  }
}
