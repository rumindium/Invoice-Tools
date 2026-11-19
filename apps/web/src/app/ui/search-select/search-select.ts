import {
  Component,
  ElementRef,
  computed,
  forwardRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

export interface SearchSelectOption {
  value: string;
  label: string;
  hint?: string;
}

/**
 * Dropdown with a search field, used where a native select gets unwieldy (units of measure,
 * customers, items). It is a form control, so `formControlName` keeps the selected value.
 */
@Component({
  selector: 'app-search-select',
  templateUrl: './search-select.html',
  styleUrl: './search-select.scss',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SearchSelectComponent),
      multi: true,
    },
  ],
  host: {
    '(document:pointerdown)': 'handleOutside($event)',
  },
})
export class SearchSelectComponent implements ControlValueAccessor {
  readonly options = input<readonly SearchSelectOption[]>([]);
  readonly placeholder = input('Choose an option');
  readonly searchPlaceholder = input('Search…');
  readonly emptyText = input('No matches');
  readonly disabled = input(false);

  /** Emits the picked value even when the control is not bound with ngModel or a form group. */
  readonly changed = output<string>();

  protected readonly value = signal('');
  protected readonly open = signal(false);
  protected readonly query = signal('');
  protected readonly highlight = signal(0);
  protected readonly isDisabled = computed(() => this.disabled() || this.formDisabled());

  protected readonly selected = computed(
    () => this.options().find((option) => option.value === this.value()) ?? null,
  );

  protected readonly filtered = computed(() => {
    const term = this.query().trim().toLowerCase();

    if (!term) {
      return this.options();
    }

    return this.options().filter(
      (option) =>
        option.label.toLowerCase().includes(term) ||
        option.value.toLowerCase().includes(term) ||
        (option.hint ?? '').toLowerCase().includes(term),
    );
  });

  private readonly formDisabled = signal(false);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  private readonly search = viewChild<ElementRef<HTMLInputElement>>('search');

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(value: unknown): void {
    if (value === null || value === undefined) {
      this.value.set('');
      return;
    }

    this.value.set(String(value));
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.formDisabled.set(isDisabled);
  }

  protected toggle(): void {
    if (this.isDisabled()) {
      return;
    }

    if (this.open()) {
      this.close();
      return;
    }

    this.query.set('');
    const index = this.filtered().findIndex((option) => option.value === this.value());
    this.highlight.set(index >= 0 ? index : 0);
    this.open.set(true);
    this.focusSearch();
  }

  protected close(focusTrigger = false): void {
    if (!this.open()) {
      return;
    }

    this.open.set(false);
    this.onTouched();

    if (focusTrigger) {
      this.trigger()?.nativeElement.focus();
    }
  }

  protected choose(option: SearchSelectOption): void {
    this.value.set(option.value);
    this.onChange(option.value);
    this.changed.emit(option.value);
    this.close(true);
  }

  protected onTriggerKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.toggle();
    }
  }

  protected onSearchInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.highlight.set(0);
  }

  protected onSearchKeydown(event: KeyboardEvent): void {
    const options = this.filtered();

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.move(1, options.length);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.move(-1, options.length);
        break;
      case 'Enter': {
        event.preventDefault();
        const option = options[this.highlight()];

        if (option) {
          this.choose(option);
        }
        break;
      }
      case 'Escape':
        event.preventDefault();
        this.close(true);
        break;
      case 'Tab':
        this.close();
        break;
    }
  }

  protected isHighlighted(index: number): boolean {
    return index === this.highlight();
  }

  protected handleOutside(event: Event): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }

  private move(step: number, length: number): void {
    if (length === 0) {
      return;
    }

    this.highlight.set((this.highlight() + step + length) % length);
  }

  private focusSearch(): void {
    if (typeof requestAnimationFrame !== 'function') {
      return;
    }

    requestAnimationFrame(() => this.search()?.nativeElement.focus());
  }
}
