import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { AppShell } from '@worship/shared-ui';

@Component({
  imports: [AppShell, RouterModule],
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {}
