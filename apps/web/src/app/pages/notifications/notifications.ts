import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AuthSessionStore } from '../../core/auth-session.store';
import { NotificationsStore } from '../../core/notifications.store';

@Component({
  selector: 'app-notifications-page',
  imports: [DatePipe],
  templateUrl: './notifications.html',
  styleUrl: './notifications.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationsPage {
  private readonly organizationId = inject(AuthSessionStore).session()?.memberships[0]?.organizationId;

  constructor(
    readonly notifications: NotificationsStore,
  ) {
    if (this.organizationId) {
      this.notifications.start(this.organizationId);
      this.notifications.load();
    }
  }
}
