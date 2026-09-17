import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnDestroy,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import {
  CanvasLayoutSchema,
  defaultCanvasLayout,
  isDefaultLayoutName,
  type CanvasLayoutDto,
  type OutputTarget,
  type SlideTemplateDto,
  type TemplateKind,
} from '@worship/shared-dto';
import { AuthSessionStore } from '../../core/auth-session.store';
import { SlidesApiService } from '../../core/slides-api.service';
import { EventBusService } from '../../core/event-bus.service';
import { CanvasEditorComponent } from '../../shared/canvas-editor/canvas-editor';
import { ConfirmationDialogComponent } from '../../shared/confirmation-dialog/confirmation-dialog';
import {
  CustomSelectComponent,
  type CustomSelectOption,
} from '../../shared/custom-select/custom-select';

@Component({
  selector: 'app-views-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    CanvasEditorComponent,
    CustomSelectComponent,
    ConfirmationDialogComponent,
  ],
  templateUrl: './views.html',
  styleUrl: './views.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewsPage implements OnDestroy {
  readonly templates = signal<readonly SlideTemplateDto[]>([]);
  readonly selected = signal<SlideTemplateDto | null>(null);
  readonly layout = signal<CanvasLayoutDto>(this.blank('Main', 'Default'));
  readonly saving = signal(false);
  readonly deleting = signal(false);
  readonly error = signal<string | null>(null);
  readonly deleteConfirmation = signal<SlideTemplateDto | null>(null);
  readonly targetOptions: readonly CustomSelectOption[] = [
    { value: 'Main', label: 'Main' },
    { value: 'Stage', label: 'Stage' },
    { value: 'Prompter', label: 'Prompter' },
    { value: 'Alpha', label: 'Alpha' },
  ];
  readonly kindOptions: readonly CustomSelectOption[] = [
    { value: 'Default', label: 'All content (fallback)' },
    { value: 'Song', label: 'Song' },
    { value: 'Bible', label: 'Bible' },
    { value: 'Sermon', label: 'Sermon' },
    { value: 'Announcement', label: 'Announcement / media' },
    { value: 'LowerThird', label: 'Lower third' },
    { value: 'Countdown', label: 'Countdown' },
    { value: 'Clock', label: 'Clock' },
  ];
  readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    target: ['Main' as OutputTarget, Validators.required],
    kind: ['Default' as TemplateKind, Validators.required],
  });
  private readonly organizationId =
    inject(AuthSessionStore).session()?.memberships[0]?.organizationId;
  private templateEvents?: Subscription;

  constructor(
    private readonly slides: SlidesApiService,
    private readonly events: EventBusService,
  ) {
    this.load();
    this.templateEvents = this.events.events$.subscribe((event) => {
      if (
        event.organizationId === this.organizationId &&
        event.type.startsWith('slide.template.')
      )
        this.load();
    });
  }

  ngOnDestroy(): void {
    this.templateEvents?.unsubscribe();
  }

  newView(): void {
    this.error.set(null);
    this.selected.set(null);
    this.form.reset({ name: '', target: 'Main', kind: 'Default' });
    this.layout.set(this.blank('Main', 'Default'));
  }

  select(template: SlideTemplateDto): void {
    this.error.set(null);
    this.selected.set(template);
    this.form.reset({
      name: template.name,
      target: template.target,
      kind: template.kind,
    });
    const parsed = CanvasLayoutSchema.safeParse(template.layout);
    this.layout.set(
      parsed.success ? parsed.data : this.blank(template.target, template.kind),
    );
  }

  isDefault(template: SlideTemplateDto | null): boolean {
    return !!template && isDefaultLayoutName(template.name);
  }

  duplicateDefault(): void {
    const template = this.selected();
    if (!template || !this.isDefault(template)) return;
    const parsed = CanvasLayoutSchema.safeParse(template.layout);
    this.selected.set(null);
    this.form.reset({
      name: `${template.name} copy`,
      target: template.target,
      kind: template.kind,
    });
    this.layout.set(
      parsed.success ? parsed.data : this.blank(template.target, template.kind),
    );
    this.error.set(null);
  }

  targetChanged(target: OutputTarget): void {
    if (!this.selected())
      this.layout.set(this.blank(target, this.form.controls.kind.value));
  }

  kindChanged(kind: TemplateKind): void {
    if (!this.selected())
      this.layout.set(this.blank(this.form.controls.target.value, kind));
  }

  viewSize(template: SlideTemplateDto): string {
    const parsed = CanvasLayoutSchema.safeParse(template.layout);
    return parsed.success
      ? `${parsed.data.size.width}×${parsed.data.size.height}`
      : 'invalid canvas';
  }

  save(): void {
    if (!this.organizationId || this.form.invalid || this.saving()) return;
    this.error.set(null);
    const value = this.form.getRawValue();
    this.saving.set(true);
    const existing = this.selected();
    const input = {
      name: value.name.trim(),
      target: value.target,
      kind: value.kind,
      layout: this.layout(),
    };
    const request = existing
      ? this.slides.updateTemplate(this.organizationId, existing.id, input)
      : this.slides.createTemplate(this.organizationId, input);
    request.subscribe({
      next: (saved) => {
        this.templates.update((items) =>
          existing
            ? items.map((item) => (item.id === saved.id ? saved : item))
            : [...items, saved],
        );
        this.select(saved);
        this.saving.set(false);
      },
      error: () => {
        this.error.set(
          'The layout could not be saved. Check its canvas and try again.',
        );
        this.saving.set(false);
      },
    });
  }

  resetDefault(): void {
    const template = this.selected();
    if (
      !this.organizationId ||
      !template ||
      !this.isDefault(template) ||
      this.saving()
    )
      return;
    this.saving.set(true);
    this.error.set(null);
    const layout = defaultCanvasLayout(template.target, 'Default');
    this.slides
      .updateTemplate(this.organizationId, template.id, { layout })
      .subscribe({
        next: (saved) => {
          this.templates.update((items) =>
            items.map((item) => (item.id === saved.id ? saved : item)),
          );
          this.select(saved);
          this.saving.set(false);
        },
        error: () => {
          this.error.set('The Default layout could not be restored.');
          this.saving.set(false);
        },
      });
  }

  requestDelete(): void {
    const template = this.selected();
    if (template) this.deleteConfirmation.set(template);
  }

  confirmDelete(): void {
    const template = this.deleteConfirmation();
    if (!this.organizationId || !template || this.deleting()) return;
    this.error.set(null);
    this.deleting.set(true);
    this.slides.removeTemplate(this.organizationId, template.id).subscribe({
      next: () => {
        const remaining = this.templates().filter(
          (item) => item.id !== template.id,
        );
        this.templates.set(remaining);
        this.deleteConfirmation.set(null);
        this.deleting.set(false);
        const fallback = remaining.find(
          (item) =>
            item.target === template.target && isDefaultLayoutName(item.name),
        );
        if (fallback) this.select(fallback);
        else this.newView();
      },
      error: () => {
        this.error.set(
          'The layout could not be removed or reconnected to its Default.',
        );
        this.deleting.set(false);
      },
    });
  }

  private load(): void {
    if (!this.organizationId) return;
    this.slides.listTemplates(this.organizationId).subscribe({
      next: (items) => {
        this.templates.set(items);
        const current = this.selected();
        if (!current) return;
        const refreshed = items.find((item) => item.id === current.id);
        if (refreshed) this.select(refreshed);
        else this.newView();
      },
    });
  }

  private blank(target: OutputTarget, kind: TemplateKind): CanvasLayoutDto {
    return defaultCanvasLayout(target, kind);
  }
}
