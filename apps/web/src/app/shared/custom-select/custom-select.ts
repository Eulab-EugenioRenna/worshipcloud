import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, forwardRef, HostListener, Input, Output, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

export interface CustomSelectOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

@Component({
  selector: 'worship-select',
  templateUrl: './custom-select.html',
  styleUrl: './custom-select.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => CustomSelectComponent), multi: true }],
})
export class CustomSelectComponent implements ControlValueAccessor {
  @Input() options: readonly CustomSelectOption[] = [];
  @Input() placeholder = 'Select';
  @Input() multiple = false;
  @Input() disabled = false;
  @Input() set value(value: string | readonly string[] | null | undefined) { this.setValue(value ?? (this.multiple ? [] : '')); }
  @Output() selectionChange = new EventEmitter<string | readonly string[]>();

  readonly open = signal(false);
  readonly filter = signal('');
  readonly selected = signal<readonly string[]>([]);
  private onChange: (value: string | readonly string[]) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  constructor(private readonly host: ElementRef<HTMLElement>) {}

  writeValue(value: string | readonly string[] | null): void { this.setValue(value ?? (this.multiple ? [] : '')); }
  registerOnChange(fn: (value: string | readonly string[]) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(disabled: boolean): void { this.disabled = disabled; }

  toggle(): void {
    if (this.disabled) return;
    this.open.update((open) => !open);
    this.filter.set('');
    this.onTouched();
  }

  choose(option: CustomSelectOption): void {
    if (option.disabled || this.disabled) return;
    const current = this.selected();
    const next = this.multiple
      ? (current.includes(option.value) ? current.filter((value) => value !== option.value) : [...current, option.value])
      : [option.value];
    this.selected.set(next);
    const value = this.multiple ? next : (next[0] ?? '');
    this.onChange(value);
    this.selectionChange.emit(value);
    if (!this.multiple) this.open.set(false);
  }

  filtered(): readonly CustomSelectOption[] {
    const term = this.filter().trim().toLocaleLowerCase();
    return term ? this.options.filter((option) => option.label.toLocaleLowerCase().includes(term)) : this.options;
  }

  label(): string {
    const selected = this.options.filter((option) => this.selected().includes(option.value)).map((option) => option.label);
    return selected.length ? selected.join(', ') : this.placeholder;
  }

  isSelected(option: CustomSelectOption): boolean { return this.selected().includes(option.value); }

  @HostListener('document:click', ['$event'])
  closeFromOutside(event: MouseEvent): void {
    if (!this.host.nativeElement.contains(event.target as Node)) this.open.set(false);
  }

  private setValue(value: string | readonly string[]): void {
    this.selected.set(Array.isArray(value) ? value.map(String) : value ? [String(value)] : []);
  }
}
