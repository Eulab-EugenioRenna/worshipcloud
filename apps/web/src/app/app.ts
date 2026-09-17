import { Component, effect } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { AuthApiService } from './core/auth-api.service';
import { AppShell } from '@worship/shared-ui';
import { AuthSessionStore } from './core/auth-session.store';
import { NotificationsStore } from './core/notifications.store';
import { RealtimeEventsService } from './core/realtime-events.service';

@Component({
  imports: [AppShell, RouterModule],
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  constructor(
    protected readonly router: Router,
    protected readonly auth: AuthSessionStore,
    private readonly authApi: AuthApiService,
    private readonly realtime: RealtimeEventsService,
    private readonly notifications: NotificationsStore,
  ) {
    effect(() => {
      const organizationId = this.auth.session()?.memberships[0]?.organizationId;
      if (!organizationId) {
        this.realtime.disconnect();
        this.notifications.stop();
        return;
      }
      this.realtime.connect(organizationId);
      this.notifications.start(organizationId);
    });
  }

  protected logout(): void {
    this.authApi.logout().subscribe({
      next: () => void this.router.navigateByUrl('/auth'),
      error: () => {
        this.auth.clear();
        void this.router.navigateByUrl('/auth');
      },
    });
  }

  protected get isStandaloneRoute(): boolean {
    return (
      this.router.url.startsWith('/auth') ||
      /^\/live\/[^/]+(?:\/control)?(?:\?|$)/.test(this.router.url) ||
      /^\/live\/[^/]+\/(preview|main|stage|prompter|alpha)(?:\?|$)/.test(
        this.router.url,
      )
    );
  }
}
