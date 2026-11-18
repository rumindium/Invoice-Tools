import { Directive, ElementRef, forwardRef, inject } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/** Prices accept at most four decimals, matching the API's numeric columns. */
const MAX_DECIMALS = 4;

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatAmount(value: number): string {
  if (!Number.isFinite(value)) {
    return '';
  }

  const sign = value < 0 ? '-' : '';
  const fixed = Math.abs(value).toFixed(MAX_DECIMALS).replace(/0+$/, '').replace(/\.$/, '');
  const [whole, fraction] = fixed.split('.');

  return `${sign}${groupThousands(whole)}${fraction ? `.${fraction}` : ''}`;
}

function parseAmount(raw: string): { display: string; value: number | null } {
  const cleaned = raw.replace(/[^\d.]/g, '');

  if (!cleaned) {
    return { display: '', value: null };
  }

  const [wholeRaw, ...fractionParts] = cleaned.split('.');
  const whole = wholeRaw.replace(/^0+(?=\d)/, '') || '0';
  const fraction = fractionParts.join('').slice(0, MAX_DECIMALS);
  const typedDot = fractionParts.length > 0;
  const display = `${groupThousands(whole)}${typedDot || fraction ? '.' : ''}${fraction}`;

  return { display, value: Number(`${whole}${fraction ? `.${fraction}` : ''}`) };
}

/**
 * Formats a numeric form control as grouped currency digits (`1,250,000`) while keeping the
 * value of the control a number, so validators and payloads stay unchanged.
 */
@Directive({
  selector: 'input[appCurrency]',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CurrencyInputDirective),
      multi: true,
    },
  ],
  host: {
    '(input)': 'handleInput()',
    '(blur)': 'handleBlur()',
  },
})
export class CurrencyInputDirective implements ControlValueAccessor {
  private readonly input = inject<ElementRef<HTMLInputElement>>(ElementRef);

  private onChange: (value: number | null) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(value: unknown): void {
    const numeric =
      typeof value === 'number'
        ? value
        : typeof value === 'string' && value.trim()
          ? Number(value)
          : null;

    this.input.nativeElement.value =
      numeric === null || !Number.isFinite(numeric) ? '' : formatAmount(numeric);
  }

  registerOnChange(fn: (value: number | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.input.nativeElement.disabled = isDisabled;
  }

  handleInput(): void {
    const element = this.input.nativeElement;
    const { display, value } = parseAmount(element.value);

    element.value = display;
    this.onChange(value);
  }

  handleBlur(): void {
    const element = this.input.nativeElement;

    if (element.value) {
      const value = Number(element.value.replace(/,/g, ''));
      element.value = Number.isFinite(value) ? formatAmount(value) : '';
    }

    this.onTouched();
  }
}
