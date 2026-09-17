import {
  type NotificationDto,
  type NotificationPageDto,
} from '@worship/shared-dto';
import { Injectable, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { EventBusService } from './event-bus.service';
import { NotificationsApiService } from './notifications-api.service';

/** Shared notification state fed by the authenticated domain-event stream. */
@Injectable({ providedIn: 'root' })
export class NotificationsStore {
  private readonly state = signal<NotificationPageDto | null>(null);
  private readonly unread = signal(0);
  private organizationId?: string;
  private unreadOnly = false;
  private loadSequence = 0;
  private subscription?: Subscription;
  private requests = new Subscription();

  readonly page = this.state.asReadonly();
  readonly unreadCount = this.unread.asReadonly();

  constructor(
    private readonly notifications: NotificationsApiService,
    private readonly events: EventBusService,
  ) {}

  start(organizationId: string): void {
    if (this.organizationId === organizationId) return;
    this.stop();
    this.organizationId = organizationId;
    this.refreshUnreadCount();
    this.subscription = this.events.events$.subscribe((event) => {
      if (
        event.organizationId === organizationId &&
        event.type === 'notification.created'
      ) {
        this.refreshUnreadCount();
        if (this.state()) this.load(this.unreadOnly);
      }
    });
  }

  stop(): void {
    this.subscription?.unsubscribe();
    this.subscription = undefined;
    this.requests.unsubscribe();
    this.requests = new Subscription();
    this.loadSequence += 1;
    this.organizationId = undefined;
    this.unreadOnly = false;
    this.state.set(null);
    this.unread.set(0);
  }

  load(unreadOnly = false): void {
    if (!this.organizationId) return;
    this.unreadOnly = unreadOnly;
    const sequence = ++this.loadSequence;
    this.requests.add(this.notifications
      .list({ organizationId: this.organizationId, limit: 25, unreadOnly })
      .subscribe((page) => {
        if (sequence === this.loadSequence) this.state.set(page);
      }));
  }

  markRead(notificationId: string): void {
    this.requests.add(this.notifications.markRead(notificationId).subscribe((notification) => {
      this.replace(notification);
      this.refreshUnreadCount();
    }));
  }

  markAllRead(): void {
    if (!this.organizationId) return;
    this.requests.add(this.notifications.markAllRead(this.organizationId).subscribe(() => {
      const page = this.state();
      if (page) {
        const readAt = new Date().toISOString();
        this.state.set({
          ...page,
          items: page.items.map((notification) => ({
            ...notification,
            readAt: notification.readAt ?? readAt,
          })),
        });
      }
      this.unread.set(0);
    }));
  }

  private refreshUnreadCount(): void {
    if (!this.organizationId) return;
    this.requests.add(this.notifications
      .unreadCount(this.organizationId)
      .subscribe(({ count }) => this.unread.set(count)));
  }

  private replace(next: NotificationDto): void {
    const page = this.state();
    if (!page) return;
    this.state.set({
      ...page,
      items: page.items.map((notification) =>
        notification.id === next.id ? next : notification,
      ),
    });
  }
}
