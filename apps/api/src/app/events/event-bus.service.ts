import {
  DomainEventSchema,
  type DomainEventDto,
  type PublishDomainEventDto,
} from '@worship/shared-dto';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type RedisClientType } from 'redis';
import { Subject } from 'rxjs';
import { PrismaService } from '../database/prisma.service';
import { StructuredLogger } from '../common/structured-logger.service';
import { Prisma } from '../../generated/prisma/client';

const EVENT_CHANNEL = 'worship:domain-events:v1';

@Injectable()
export class EventBusService implements OnModuleInit, OnModuleDestroy {
  private readonly subject = new Subject<DomainEventDto>();
  private readonly handlers = new Set<
    (event: DomainEventDto) => Promise<void>
  >();
  private readonly seenEventIds = new Set<string>();
  private publisher?: RedisClientType;
  private subscriber?: RedisClientType;

  readonly events$ = this.subject.asObservable();

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: StructuredLogger,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const url = this.config.getOrThrow<string>('REDIS_URL');
    this.publisher = createClient({ url });
    this.subscriber = this.publisher.duplicate();
    this.publisher.on('error', (error) =>
      this.logger.error(
        { event: 'realtime.redis.publisher-error', error: error.message },
        error.stack,
        EventBusService.name,
      ),
    );
    this.subscriber.on('error', (error) =>
      this.logger.error(
        { event: 'realtime.redis.subscriber-error', error: error.message },
        error.stack,
        EventBusService.name,
      ),
    );
    await Promise.all([this.publisher.connect(), this.subscriber.connect()]);
    await this.subscriber.subscribe(EVENT_CHANNEL, (raw) => {
      try {
        const parsed = DomainEventSchema.safeParse(JSON.parse(raw));
        if (!parsed.success || this.seenEventIds.has(parsed.data.id)) return;
        void this.dispatch(parsed.data);
      } catch (error) {
        this.logger.error(
          {
            event: 'realtime.redis.invalid-event',
            error: error instanceof Error ? error.message : String(error),
          },
          error instanceof Error ? error.stack : undefined,
          EventBusService.name,
        );
      }
    });
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([
      this.publisher?.isOpen ? this.publisher.quit() : undefined,
      this.subscriber?.isOpen ? this.subscriber.quit() : undefined,
    ]);
  }

  subscribe(handler: (event: DomainEventDto) => Promise<void>): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async publish(input: PublishDomainEventDto): Promise<DomainEventDto> {
    const stored = await this.prisma.domainEvent.create({
      data: { ...input, payload: input.payload as Prisma.InputJsonValue },
    });
    const event = DomainEventSchema.parse({
      ...stored,
      occurredAt: stored.occurredAt.toISOString(),
    });

    this.logger.log(
      { event: 'domain.event.published', type: event.type, eventId: event.id },
      EventBusService.name,
    );

    await this.dispatch(event);
    await this.publisher?.publish(EVENT_CHANNEL, JSON.stringify(event));
    return event;
  }

  private async dispatch(event: DomainEventDto): Promise<void> {
    this.remember(event.id);
    for (const handler of this.handlers) {
      try {
        await handler(event);
      } catch (error) {
        this.logger.error(
          {
            event: 'domain.event.handler-failed',
            type: event.type,
            eventId: event.id,
            error: error instanceof Error ? error.message : String(error),
          },
          error instanceof Error ? error.stack : undefined,
          EventBusService.name,
        );
      }
    }
    this.subject.next(event);
  }

  private remember(eventId: string): void {
    this.seenEventIds.add(eventId);
    if (this.seenEventIds.size > 10_000) {
      const oldest = this.seenEventIds.values().next().value;
      if (oldest) this.seenEventIds.delete(oldest);
    }
  }
}
