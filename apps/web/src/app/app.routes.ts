import { Route } from '@angular/router';
import { authenticatedGuard } from './core/auth.guard';

export const appRoutes: Route[] = [
  {
    path: 'auth',
    loadComponent: () =>
      import('./pages/auth/auth').then((module) => module.AuthPage),
  },
  {
    path: 'dashboard',
    canActivate: [authenticatedGuard],
    loadComponent: () =>
      import('./pages/dashboard/dashboard').then((module) => module.Dashboard),
  },
  {
    path: 'services',
    canActivate: [authenticatedGuard],
    pathMatch: 'full',
    loadComponent: () =>
      import('./pages/services/services').then((module) => module.ServicesPage),
  },
  {
    path: 'services/:serviceId',
    canActivate: [authenticatedGuard],
    loadComponent: () =>
      import('./pages/service-detail/service-detail').then((module) => module.ServiceDetailPage),
  },
  {
    path: 'songs/:songId',
    canActivate: [authenticatedGuard],
    loadComponent: () =>
      import('./pages/song-editor/song-editor').then((module) => module.SongEditorPage),
  },
  {
    path: 'songs',
    canActivate: [authenticatedGuard],
    loadComponent: () =>
      import('./pages/songs/songs').then((module) => module.SongsPage),
  },
  {
    path: 'bible',
    canActivate: [authenticatedGuard],
    loadComponent: () =>
      import('./pages/bible/bible').then((module) => module.BiblePage),
  },
  {
    path: 'team',
    canActivate: [authenticatedGuard],
    loadComponent: () =>
      import('./pages/team/team').then((module) => module.TeamPage),
  },
  {
    path: 'library',
    canActivate: [authenticatedGuard],
    loadComponent: () =>
      import('./pages/library/library').then((module) => module.LibraryPage),
  },
  {
    path: 'settings/views/:templateId/preview',
    canActivate: [authenticatedGuard],
    loadComponent: () => import('./pages/view-preview/view-preview').then((module) => module.ViewPreviewPage),
  },
  {
    path: 'settings/views',
    canActivate: [authenticatedGuard],
    loadComponent: () => import('./pages/views/views').then((module) => module.ViewsPage),
  },
  { path: 'views', pathMatch: 'full', redirectTo: 'settings/views' },
  {
    path: 'slides/:slideId',
    canActivate: [authenticatedGuard],
    loadComponent: () =>
      import('./pages/slide-editor/slide-editor').then((module) => module.SlideEditorPage),
  },
  {
    path: 'notifications',
    canActivate: [authenticatedGuard],
    loadComponent: () =>
      import('./pages/notifications/notifications').then((module) => module.NotificationsPage),
  },
  {
    path: 'live/:sessionId',
    pathMatch: 'full',
    canActivate: [authenticatedGuard],
    loadComponent: () =>
      import('./pages/live-control/live-control').then((module) => module.LiveControlPage),
  },
  {
    path: 'live/:sessionId/control',
    canActivate: [authenticatedGuard],
    loadComponent: () =>
      import('./pages/live-control/live-control').then((module) => module.LiveControlPage),
  },
  {
    path: 'live/:sessionId/:output',
    loadComponent: () =>
      import('./pages/live-output/live-output').then((module) => module.LiveOutputPage),
  },
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  { path: '**', redirectTo: 'dashboard' },
];
