import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

interface NavigationItem {
  readonly label: string;
  readonly path: string;
  readonly iconPaths: readonly string[];
}

@Component({
  selector: 'worship-app-shell',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppShell {
  @Input() userName: string | null = null;
  @Input() organizationName: string | null = null;
  @Output() logoutRequested = new EventEmitter<void>();
  protected readonly navigation: readonly NavigationItem[] = [
    { label: 'Dashboard', path: '/dashboard', iconPaths: ['M4 4h6v6H4z', 'M14 4h6v6h-6z', 'M4 14h6v6H4z', 'M14 14h6v6h-6z'] },
    { label: 'Services', path: '/services', iconPaths: ['M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z', 'M8 2v4', 'M16 2v4', 'M4 10h16'] },
    { label: 'Songs', path: '/songs', iconPaths: ['M9 18V6l10-2v12', 'M9 10l10-2', 'M5 20a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M15 18a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z'] },
    { label: 'Bible', path: '/bible', iconPaths: ['M4 5.5A2.5 2.5 0 0 1 6.5 3H11v17H6.5A2.5 2.5 0 0 0 4 22Z', 'M20 5.5A2.5 2.5 0 0 0 17.5 3H13v17h4.5A2.5 2.5 0 0 1 20 22Z'] },
    { label: 'Team', path: '/team', iconPaths: ['M16 20v-1.5A3.5 3.5 0 0 0 12.5 15h-5A3.5 3.5 0 0 0 4 18.5V20', 'M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z', 'M16 4.5a3.5 3.5 0 0 1 0 6', 'M20 20v-1.5a3.5 3.5 0 0 0-2.5-3.35'] },
    { label: 'Library', path: '/library', iconPaths: ['M5 4h5v16H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z', 'M10 4h5v16h-5z', 'M15 5h3a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-3Z'] },
    { label: 'Settings', path: '/settings/views', iconPaths: ['M4 5h16v14H4z', 'M8 19v2', 'M16 19v2', 'M9 9h6', 'M12 6v6'] },
    { label: 'Signals', path: '/notifications', iconPaths: ['M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9', 'M10 22h4'] },
  ];
}
