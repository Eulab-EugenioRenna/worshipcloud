import { DomainEventSchema } from '@worship/shared-dto';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthSessionStore } from './auth-session.store';
import { AuthTokenRefreshService } from './auth-token-refresh.service';
import { BrowserLogger } from './browser-logger.service';
import { EventBusService } from './event-bus.service';

@Injectable({ providedIn: 'root' })
export class RealtimeEventsService {
  private readonly auth = inject(AuthSessionStore);
  private readonly bus = inject(EventBusService);
  private readonly logger = inject(BrowserLogger);
  private readonly refresh = inject(AuthTokenRefreshService);
  private controller?: AbortController;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private organizationId?: string;
  private lastEventAt?: string;
  private lastEventId?: string;

  connect(organizationId: string): void {
    // A token refresh replaces AuthSessionStore state; it must not reset an active event cursor.
    if (this.organizationId === organizationId && this.controller) return;
    this.disconnect();
    const token = this.auth.accessToken();
    if (!token)
      throw new Error('Authentication is required for realtime events');
    this.organizationId = organizationId;
    this.controller = new AbortController();
    void this.consume(organizationId, token, this.controller);
  }

  disconnect(): void {
    this.controller?.abort();
    this.controller = undefined;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.organizationId = undefined;
    this.lastEventAt = undefined;
    this.lastEventId = undefined;
  }

  private async consume(
    organizationId: string,
    token: string,
    controller: AbortController,
  ): Promise<void> {
    const signal = controller.signal;
    try {
      const after = this.lastEventAt
        ? `&after=${encodeURIComponent(this.lastEventAt)}${this.lastEventId ? `&afterId=${encodeURIComponent(this.lastEventId)}` : ''}`
        : '';
      const response = await fetch(
        `/api/v1/events/stream?organizationId=${encodeURIComponent(organizationId)}${after}`,
        {
          headers: {
            Accept: 'text/event-stream',
            Authorization: `Bearer ${token}`,
          },
          signal,
        },
      );
      if (response.status === 401) {
        await firstValueFrom(this.refresh.refresh());
        return;
      }
      if (!response.ok || !response.body)
        throw new Error(`Realtime connection failed (${response.status})`);
      const reader = response.body
        .pipeThrough(new TextDecoderStream())
        .getReader();
      let buffer = '';
      while (!signal.aborted) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const frames = buffer.split(/\r?\n\r?\n/);
        buffer = frames.pop() ?? '';
        for (const frame of frames) {
          const data = frame
            .split('\n')
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trim())
            .join('\n');
          if (!data) continue;
          try {
            const parsed = DomainEventSchema.safeParse(JSON.parse(data));
            if (parsed.success) {
              this.lastEventAt = parsed.data.occurredAt;
              this.lastEventId = parsed.data.id;
              this.bus.publish(parsed.data);
            } else {
              this.logger.warn(
                'RealtimeEventsService',
                'events.stream.invalid-payload',
                'An invalid realtime event was ignored',
              );
            }
          } catch {
            this.logger.warn(
              'RealtimeEventsService',
              'events.stream.invalid-frame',
              'An invalid SSE frame was ignored',
            );
          }
        }
      }
    } catch (error) {
      if (!signal.aborted)
        this.logger.error(
          'RealtimeEventsService',
          'events.stream.failed',
          error instanceof Error ? error.message : String(error),
        );
    } finally {
      if (!signal.aborted && this.controller === controller) {
        this.reconnectTimer = setTimeout(() => {
          if (this.controller === controller && !signal.aborted) {
            const nextToken = this.auth.accessToken();
            if (nextToken) void this.consume(organizationId, nextToken, controller);
          }
        }, 2_000);
      }
    }
  }
}
