import { LiveStateSchema, type LiveStateDto } from '@worship/shared-dto';
import { Injectable, signal } from '@angular/core';
import { io, type Socket } from 'socket.io-client';

/** Public-output state. It deliberately has no authenticated organization data. */
@Injectable({ providedIn: 'root' })
export class LiveOutputStateService {
  private readonly stateSignal = signal<LiveStateDto | null>(null);
  private socket?: Socket;

  readonly state = this.stateSignal.asReadonly();

  connect(sessionId: string, accessKey: string): void {
    this.disconnect();
    void this.loadAndConnect(sessionId, accessKey);
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = undefined;
    this.stateSignal.set(null);
  }

  private async loadAndConnect(
    sessionId: string,
    accessKey: string,
  ): Promise<void> {
    const base = `/api/v1/live-sessions/${encodeURIComponent(sessionId)}`;
    const query = `key=${encodeURIComponent(accessKey)}`;
    const initial = await fetch(`${base}/state?${query}`);
    if (!initial.ok) throw new Error(`Live state is unavailable (${initial.status})`);
    this.stateSignal.set(LiveStateSchema.parse(await initial.json()));

    const socket = io('/live', {
      query: { sessionId, key: accessKey },
      transports: ['websocket'],
    });
    this.socket = socket;
    socket.on('state', (state: unknown) => {
      try {
        this.stateSignal.set(LiveStateSchema.parse(state));
      } catch {
        // A malformed update is isolated; Socket.IO reconnects independently.
      }
    });
  }
}
