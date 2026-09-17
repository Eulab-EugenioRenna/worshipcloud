import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { MyServiceTeamAssignmentDto, TeamAssignmentStatus } from '@worship/shared-dto';
import { AuthSessionStore } from '../../core/auth-session.store';
import { TeamApiService } from '../../core/team-api.service';

@Component({
  selector: 'app-team-page',
  imports: [DatePipe, RouterLink],
  templateUrl: './team.html',
  styleUrl: './team.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamPage {
  readonly assignments = signal<readonly MyServiceTeamAssignmentDto[]>([]);
  readonly changingId = signal<string | null>(null);
  private readonly organizationId = inject(AuthSessionStore).session()?.memberships[0]?.organizationId;

  constructor(
    private readonly team: TeamApiService,
  ) { this.load(); }

  setStatus(assignment: MyServiceTeamAssignmentDto, status: TeamAssignmentStatus): void {
    if (!this.organizationId || this.changingId()) return;
    this.changingId.set(assignment.id);
    this.team.update(this.organizationId, assignment.serviceId, assignment.id, { status }).subscribe({
      next: (updated) => {
        this.assignments.update((assignments) => assignments.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
        this.changingId.set(null);
      },
      error: () => this.changingId.set(null),
    });
  }

  private load(): void {
    if (!this.organizationId) return;
    this.team.listMine(this.organizationId).subscribe({ next: (assignments) => this.assignments.set(assignments) });
  }
}
