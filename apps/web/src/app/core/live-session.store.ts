import {
  LiveStateSchema,
  type LiveSessionDto,
  type LiveStateDto,
} from '@worship/shared-dto';
import { Injectable, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { io, type Socket } from 'socket.io-client';
import { AuthSessionStore } from './auth-session.store';
import { EventBusService } from './event-bus.service';
import { LiveApiService } from './live-api.service';

/** Authenticated Control-side state, synchronized from the organization event bus. */
@Injectable({ providedIn: 'root' })
export class LiveSessionStore {
  private readonly sessionState = signal<LiveSessionDto | null>(null);
  private readonly liveState = signal<LiveStateDto | null>(null);
  private subscription?: Subscription;
  private socket?: Socket;
  private sessionId?: string;

  readonly session = this.sessionState.asReadonly();
  readonly state = this.liveState.asReadonly();

  constructor(
    private readonly live: LiveApiService,
    private readonly events: EventBusService,
    private readonly auth: AuthSessionStore,
  ) {}

  load(sessionId: string): void {
    this.stop();
    this.sessionId = sessionId;
    this.live.get(sessionId).subscribe((session) => this.setSession(session));
    const token = this.auth.accessToken();
    if (token) {
      this.socket = io('/live', {
        auth: { token },
        query: { sessionId },
        transports: ['websocket'],
      });
      this.socket.on('state', (state: unknown) => {
        const parsed = LiveStateSchema.safeParse(state);
        if (parsed.success) this.liveState.set(parsed.data);
      });
    }
    this.subscription = this.events.events$.subscribe((event) => {
      if (
        event.payload.sessionId === sessionId &&
        event.payload.liveState !== undefined
      ) {
        this.liveState.set(LiveStateSchema.parse(event.payload.liveState));
      }
    });
  }

  stop(): void {
    this.subscription?.unsubscribe();
    this.subscription = undefined;
    this.socket?.disconnect();
    this.socket = undefined;
    this.sessionId = undefined;
    this.sessionState.set(null);
    this.liveState.set(null);
  }

  setSession(session: LiveSessionDto): void {
    if (this.sessionId && session.id !== this.sessionId) return;
    this.sessionId = session.id;
    this.sessionState.set(session);
    this.liveState.set(session.state);
  }
}
