import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

/** Application-owned confirmation surface, used instead of browser dialogs. */
@Component({
  selector: 'worship-confirmation-dialog',
  templateUrl: './confirmation-dialog.html',
  styleUrl: './confirmation-dialog.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmationDialogComponent {
  @Input({ required: true }) title = '';
  @Input({ required: true }) description = '';
  @Input() confirmLabel = 'Confirm';
  @Input() destructive = false;
  @Input() pending = false;
  @Output() confirmed = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();
}
