import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

interface NavigationItem {
  readonly label: string;
  readonly path: string;
  readonly icon: string;
}

@Component({
  selector: 'worship-app-shell',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppShell {
  protected readonly navigation: readonly NavigationItem[] = [
    { label: 'Dashboard', path: '/dashboard', icon: 'grid' },
    { label: 'Services', path: '/services', icon: 'calendar' },
    { label: 'Songs', path: '/songs', icon: 'music' },
    { label: 'Bible', path: '/bible', icon: 'book' },
    { label: 'Media', path: '/media', icon: 'media' },
    { label: 'Team', path: '/team', icon: 'users' },
    { label: 'Live', path: '/live', icon: 'live' },
    { label: 'Library', path: '/library', icon: 'library' },
    { label: 'Settings', path: '/settings', icon: 'settings' },
  ];
}
