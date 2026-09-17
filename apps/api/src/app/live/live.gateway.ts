import { type DomainEventDto } from '@worship/shared-dto';
import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { EventBusService } from '../events/event-bus.service';
import { AuthService } from '../auth/auth.service';
import { LiveService } from './live.service';

const roomFor = (sessionId: string) => `live:${sessionId}`;

@WebSocketGateway({ namespace: '/live', cors: { origin: true } })
export class LiveGateway implements OnGatewayConnection {
  @WebSocketServer()
  private server!: Server;

  constructor(
    private readonly live: LiveService,
    private readonly auth: AuthService,
    events: EventBusService,
  ) {
    events.events$.subscribe((event) => this.broadcast(event));
  }

  async handleConnection(client: Socket): Promise<void> {
    const sessionId = this.queryString(client, 'sessionId');
    const key = this.queryString(client, 'key');
    const token = this.authToken(client);
    if (!sessionId || (!key && !token)) {
      client.disconnect(true);
      return;
    }
    try {
      const state = key
        ? await this.live.getOutputState(sessionId, key)
        : (await this.live.get((await this.auth.principalForAccessToken(token!)).userId, sessionId)).state;
      await client.join(roomFor(sessionId));
      client.emit('state', state);
    } catch (error) {
      Logger.warn(
        `Rejected Live socket connection: ${error instanceof Error ? error.message : String(error)}`,
        LiveGateway.name,
      );
      client.disconnect(true);
    }
  }

  private broadcast(event: DomainEventDto): void {
    if (!['live.state.updated', 'live.session.started', 'live.session.ended'].includes(event.type)) return;
    const sessionId = event.payload.sessionId;
    const state = event.payload.liveState;
    if (!sessionId || !state) return;
    this.server?.to(roomFor(sessionId)).emit('state', state);
  }

  private queryString(client: Socket, name: string): string | undefined {
    const value = client.handshake.query[name];
    return typeof value === 'string' ? value : undefined;
  }

  private authToken(client: Socket): string | undefined {
    const token = client.handshake.auth.token;
    return typeof token === 'string' ? token : undefined;
  }
}
