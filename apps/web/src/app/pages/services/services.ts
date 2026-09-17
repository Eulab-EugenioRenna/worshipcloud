import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { OrganizationOverviewDto, ServiceDto } from '@worship/shared-dto';
import { AuthSessionStore } from '../../core/auth-session.store';
import { LiveApiService } from '../../core/live-api.service';
import { OrganizationsApiService } from '../../core/organizations-api.service';
import { ServicesApiService } from '../../core/services-api.service';
import { CustomSelectComponent } from '../../shared/custom-select/custom-select';

@Component({
  selector: 'app-services-page',
  imports: [DatePipe, ReactiveFormsModule, RouterLink, CustomSelectComponent],
  templateUrl: './services.html',
  styleUrl: './services.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ServicesPage {
  protected locationOptions() {
    return (this.organization()?.locations ?? []).map((location) => ({
      value: location.id,
      label: location.name,
    }));
  }
  protected memberOptions() {
    return (this.organization()?.members ?? []).map((member) => ({
      value: member.user.id,
      label: member.user.name,
    }));
  }
  readonly organization = signal<OrganizationOverviewDto | null>(null);
  readonly services = signal<readonly ServiceDto[]>([]);
  readonly creating = signal(false);
  readonly showCreate = signal(false);
  readonly error = signal<string | null>(null);
  readonly liveError = signal<string | null>(null);
  readonly startingServiceId = signal<string | null>(null);
  private readonly organizationId =
    inject(AuthSessionStore).session()?.memberships[0]?.organizationId;
  readonly form = inject(FormBuilder).nonNullable.group({
    title: ['', [Validators.required, Validators.minLength(2)]],
    date: [new Date().toISOString().slice(0, 10), Validators.required],
    time: ['10:30', Validators.required],
    locationId: ['', Validators.required],
    responsibleUserId: ['', Validators.required],
    notes: [''],
  });

  constructor(
    private readonly organizations: OrganizationsApiService,
    private readonly servicesApi: ServicesApiService,
    private readonly live: LiveApiService,
    private readonly router: Router,
  ) {
    if (!this.organizationId) return;
    this.organizations.getOverview(this.organizationId).subscribe({
      next: (organization) => {
        this.organization.set(organization);
        const owner = organization.members[0];
        this.form.patchValue({
          locationId: organization.locations[0]?.id ?? '',
          responsibleUserId: owner?.user.id ?? '',
        });
      },
    });
    this.servicesApi
      .list(this.organizationId)
      .subscribe({ next: (services) => this.services.set(services) });
  }

  create(): void {
    if (!this.organizationId || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.creating.set(true);
    this.error.set(null);
    const value = this.form.getRawValue();
    this.servicesApi
      .create(this.organizationId, {
        ...value,
        ...(value.notes ? { notes: value.notes } : {}),
      })
      .subscribe({
        next: (service) => {
          this.services.update((current) => [...current, service]);
          this.showCreate.set(false);
          this.creating.set(false);
          this.form.patchValue({ title: '', notes: '' });
        },
        error: () => {
          this.error.set(
            'Service could not be created. Review the selected location and leader.',
          );
          this.creating.set(false);
        },
      });
  }

  goLive(serviceId: string): void {
    if (!this.organizationId || this.startingServiceId()) return;
    this.startingServiceId.set(serviceId);
    this.liveError.set(null);
    this.live.start(this.organizationId, serviceId).subscribe({
      next: (session) =>
        void this.router.navigate(['/live', session.id, 'control']),
      error: (error: unknown) => {
        this.liveError.set(this.liveErrorMessage(error));
        this.startingServiceId.set(null);
      },
    });
  }

  private liveErrorMessage(error: unknown): string {
    if (
      typeof error === 'object' &&
      error !== null &&
      'error' in error &&
      typeof error.error === 'object' &&
      error.error !== null &&
      'message' in error.error &&
      typeof error.error.message === 'string'
    )
      return error.error.message;
    return 'Live could not be started.';
  }
}
