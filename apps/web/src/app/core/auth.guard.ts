import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { AuthSessionStore } from './auth-session.store';

export const authenticatedGuard: CanActivateFn = () => {
  const session = inject(AuthSessionStore).session();
  return session ? true : inject(Router).createUrlTree(['/auth']);
};
