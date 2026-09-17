import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import type {
  MyServiceTeamAssignmentDto,
  ServiceDto,
} from '@worship/shared-dto';
import { AuthSessionStore } from '../../core/auth-session.store';
import { NotificationsApiService } from '../../core/notifications-api.service';
import { ServicesApiService } from '../../core/services-api.service';
import { TeamApiService } from '../../core/team-api.service';

@Component({
  selector: 'app-dashboard',
  imports: [DatePipe, RouterLink],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dashboard {
  protected readonly organizationId =
    inject(AuthSessionStore).session()?.memberships[0]?.organizationId;
  readonly services = signal<readonly ServiceDto[]>([]);
  readonly shifts = signal<readonly MyServiceTeamAssignmentDto[]>([]);
  readonly unreadCount = signal(0);
  readonly loading = signal(true);
  readonly nextService = computed(
    () =>
      this.services().find((service) => service.status !== 'Completed') ?? null,
  );

  constructor(
    protected readonly auth: AuthSessionStore,
    private readonly servicesApi: ServicesApiService,
    private readonly teamApi: TeamApiService,
    private readonly notifications: NotificationsApiService,
    private readonly router: Router,
  ) {
    if (!this.organizationId) {
      void this.router.navigateByUrl('/auth');
      return;
    }
    forkJoin({
      services: this.servicesApi.list(this.organizationId),
      shifts: this.teamApi.listMine(this.organizationId),
      unread: this.notifications.unreadCount(this.organizationId),
    }).subscribe({
      next: ({ services, shifts, unread }) => {
        this.services.set(services);
        this.shifts.set(shifts);
        this.unreadCount.set(unread.count);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
