import { AuthSessionSchema, type AuthSessionDto } from '@worship/shared-dto';
import { computed, Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'worship.auth-session';

@Injectable({ providedIn: 'root' })
export class AuthSessionStore {
  private readonly state = signal<AuthSessionDto | null>(this.restore());

  readonly session = this.state.asReadonly();
  readonly accessToken = computed(
    () => this.state()?.tokens.accessToken ?? null,
  );
  readonly currentUser = computed(() => this.state()?.user ?? null);

  set(session: AuthSessionDto): void {
    const value = AuthSessionSchema.parse(session);
    this.state.set(value);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  }

  clear(): void {
    this.state.set(null);
    sessionStorage.removeItem(STORAGE_KEY);
  }

  private restore(): AuthSessionDto | null {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      const result = AuthSessionSchema.safeParse(JSON.parse(raw));
      if (result.success) return result.data;
    } catch {
      // Invalid browser state is discarded below.
    }
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  }
}
