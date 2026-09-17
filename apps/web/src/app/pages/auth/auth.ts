import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthApiService } from '../../core/auth-api.service';
import { AuthSessionStore } from '../../core/auth-session.store';

@Component({
  selector: 'app-auth-page',
  imports: [ReactiveFormsModule],
  templateUrl: './auth.html',
  styleUrl: './auth.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthPage {
  readonly mode = signal<'login' | 'register'>('login');
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);
  readonly loginForm = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });
  readonly registerForm = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    organizationName: ['', [Validators.required, Validators.minLength(2)]],
    locationName: ['Main', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(10)]],
  });

  constructor(
    private readonly auth: AuthApiService,
    private readonly session: AuthSessionStore,
    private readonly router: Router,
  ) {
    if (this.session.session()) void this.router.navigateByUrl('/dashboard');
  }

  setMode(mode: 'login' | 'register'): void {
    if (this.submitting()) return;
    this.mode.set(mode);
    this.error.set(null);
  }

  submit(): void {
    if (this.submitting()) return;
    const form = this.mode() === 'login' ? this.loginForm : this.registerForm;
    if (form.invalid) {
      form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.error.set(null);
    const request = this.mode() === 'login'
      ? this.auth.login(this.loginForm.getRawValue())
      : this.auth.register(this.registerForm.getRawValue());
    request.subscribe({
      next: () => void this.router.navigateByUrl('/dashboard'),
      error: (error: unknown) => {
        this.error.set(
          typeof error === 'object' && error !== null && 'error' in error &&
            typeof error.error === 'object' && error.error !== null &&
            'message' in error.error && typeof error.error.message === 'string'
            ? error.error.message
            : 'Unable to continue. Check your details and try again.',
        );
        this.submitting.set(false);
      },
      complete: () => this.submitting.set(false),
    });
  }
}
