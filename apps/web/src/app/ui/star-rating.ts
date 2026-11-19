import { Component, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

const STAR = 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z';

/**
 * 1–5 star rating. As a form control the value is a number or null (no rating; click the
 * chosen star again to clear it). With `readonly` it only displays the value.
 */
@Component({
  selector: 'app-star-rating',
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => StarRating), multi: true },
  ],
  template: `
    <span
      class="stars"
      [class.is-readonly]="readonly()"
      [attr.role]="readonly() ? 'img' : 'radiogroup'"
      [attr.aria-label]="readonly() ? label() : 'Rating'"
    >
      @for (star of stars; track star) {
        @if (readonly()) {
          <svg viewBox="0 0 24 24" [class.is-on]="star <= (shown() ?? 0)" aria-hidden="true">
            <path [attr.d]="path" />
          </svg>
        } @else {
          <button
            type="button"
            role="radio"
            [attr.aria-checked]="star === value()"
            [attr.aria-label]="'Rate ' + star + ' out of 5'"
            [disabled]="disabled()"
            (click)="choose(star)"
            (mouseenter)="hover.set(star)"
            (mouseleave)="hover.set(null)"
          >
            <svg
              viewBox="0 0 24 24"
              [class.is-on]="star <= (hover() ?? value() ?? 0)"
              aria-hidden="true"
            >
              <path [attr.d]="path" />
            </svg>
          </button>
        }
      }
      @if (!readonly()) {
        <span class="stars-text">{{ value() ? value() + ' / 5' : 'No rating' }}</span>
      }
    </span>
  `,
  styles: `
    .stars {
      display: inline-flex;
      align-items: center;
      gap: 2px;
    }
    button {
      display: grid;
      border: 0;
      background: none;
      padding: 1px;
      cursor: pointer;
    }
    button:disabled {
      cursor: not-allowed;
    }
    svg {
      width: 20px;
      height: 20px;
      fill: #e5e7eb;
      stroke: #d1d5db;
      stroke-width: 1;
    }
    .is-readonly svg {
      width: 14px;
      height: 14px;
    }
    svg.is-on {
      fill: #f59e0b;
      stroke: #d97706;
    }
    .stars-text {
      margin-left: 8px;
      color: var(--muted);
      font-size: 11px;
    }
  `,
})
export class StarRating implements ControlValueAccessor {
  readonly readonly = input(false);
  /** The value to display in read-only mode. */
  readonly rating = input<number | null>(null);

  protected readonly stars = [1, 2, 3, 4, 5];
  protected readonly path = STAR;
  protected readonly value = signal<number | null>(null);
  protected readonly hover = signal<number | null>(null);
  protected readonly disabled = signal(false);

  private onChange: (value: number | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  protected shown(): number | null {
    return this.readonly() ? this.rating() : this.value();
  }

  protected label(): string {
    const rating = this.rating();
    return rating ? `${rating} out of 5 stars` : 'Not rated';
  }

  protected choose(star: number): void {
    const next = this.value() === star ? null : star;
    this.value.set(next);
    this.onChange(next);
    this.onTouched();
  }

  writeValue(value: number | null): void {
    this.value.set(value ?? null);
  }

  registerOnChange(fn: (value: number | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }
}
