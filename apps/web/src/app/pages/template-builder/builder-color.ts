import { Component, ElementRef, computed, inject, input, output, signal } from '@angular/core';
import { isHexColor } from '../../core/template-theme';
import { BRAND_COLORS, PALETTE } from './builder.model';
import { BuilderStore } from './builder.store';

/**
 * Colour button with a Canva-style popover: document colours, brand colours, default palette,
 * a native picker and a hex field. Emits `picked` with a hex colour, or null for "no colour".
 */
@Component({
  selector: 'app-builder-color',
  host: {
    '(document:pointerdown)': 'outside($event)',
    '(document:keydown.escape)': 'open.set(false)',
  },
  template: `
    <button
      type="button"
      class="trigger"
      [class.is-open]="open()"
      [class.is-text]="mode() === 'text'"
      [attr.aria-label]="label() + ': ' + (value() ?? 'none')"
      [attr.aria-expanded]="open()"
      [attr.data-testid]="testId()"
      [title]="label()"
      (click)="toggle($event)"
    >
      @if (mode() === 'text') {
        <span class="glyph">A</span>
        <span class="bar" [style.background]="value() ?? 'transparent'"></span>
      } @else {
        <span class="chip" [class.is-none]="!value()" [style.background]="value()"></span>
      }
    </button>
    @if (open()) {
      <div
        class="pop"
        role="dialog"
        [attr.aria-label]="label()"
        [attr.data-testid]="testId() + '-popover'"
        [style.left.px]="position().left"
        [style.top.px]="position().top"
      >
        <div class="custom">
          <input
            type="color"
            [value]="value() ?? '#000000'"
            aria-label="Custom colour"
            (input)="pick($event)"
          />
          <input
            class="hex"
            [value]="value() ?? ''"
            placeholder="#000000"
            aria-label="Hex colour"
            spellcheck="false"
            [attr.data-testid]="testId() + '-hex'"
            (keydown.enter)="hex($event)"
            (change)="hex($event)"
          />
          @if (allowNone()) {
            <button type="button" class="none" title="No colour" (click)="choose(null)">
              <span class="chip is-none"></span>
            </button>
          }
        </div>
        @for (group of groups(); track group.title) {
          <p class="title">{{ group.title }}</p>
          <div class="grid">
            @for (color of group.colors; track color) {
              <button
                type="button"
                class="swatch"
                [class.is-active]="color === value()?.toLowerCase()"
                [style.background]="color"
                [attr.aria-label]="color"
                [title]="color"
                (click)="choose(color)"
              ></button>
            }
          </div>
        }
      </div>
    }
  `,
  styles: `
    :host {
      position: relative;
      display: inline-flex;
    }
    .trigger {
      display: grid;
      width: 34px;
      height: 34px;
      place-items: center;
      border: 1px solid transparent;
      border-radius: 8px;
      background: none;
      cursor: pointer;
    }
    .trigger:hover,
    .trigger.is-open {
      background: var(--st-surface-2, #f1f3f9);
    }
    .chip {
      width: 24px;
      height: 24px;
      border-radius: 6px;
      box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.15);
    }
    .chip.is-none {
      background: linear-gradient(135deg, #fff 45%, #ef4444 45%, #ef4444 55%, #fff 55%) !important;
    }
    .trigger.is-text {
      gap: 1px;
      align-content: center;
    }
    .glyph {
      font:
        700 16px/1 Georgia,
        serif;
      color: var(--st-text, #1b1f27);
    }
    .bar {
      width: 20px;
      height: 4px;
      border-radius: 2px;
      box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.15);
    }
    .pop {
      position: fixed;
      z-index: 80;
      width: 252px;
      border: 1px solid var(--st-line, #e5e7eb);
      border-radius: 12px;
      background: #fff;
      padding: 12px;
      box-shadow: 0 16px 40px -12px rgba(15, 23, 42, 0.35);
    }
    .custom {
      display: flex;
      gap: 6px;
      align-items: center;
    }
    input[type='color'] {
      width: 34px;
      height: 32px;
      flex: none;
      border: 1px solid var(--st-line, #e5e7eb);
      border-radius: 8px;
      background: #fff;
      padding: 2px;
      cursor: pointer;
    }
    .hex {
      min-width: 0;
      flex: 1;
      border: 1px solid var(--st-line, #e5e7eb);
      border-radius: 8px;
      padding: 7px 9px;
      font:
        600 12px/1 'IBM Plex Mono',
        monospace;
      text-transform: lowercase;
    }
    .hex:focus {
      border-color: var(--st-accent, #2563eb);
      outline: none;
    }
    .none {
      display: grid;
      border: 0;
      background: none;
      cursor: pointer;
      padding: 2px;
    }
    .title {
      margin: 12px 0 6px;
      color: var(--st-muted, #5b6474);
      font-size: 11px;
      font-weight: 650;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(8, 1fr);
      gap: 5px;
    }
    .swatch {
      aspect-ratio: 1;
      border: 0;
      border-radius: 50%;
      cursor: pointer;
      box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.14);
      transition: transform 100ms ease-out;
    }
    .swatch:hover {
      transform: scale(1.12);
    }
    .swatch.is-active {
      box-shadow:
        0 0 0 2px #fff,
        0 0 0 4px var(--st-accent, #2563eb);
    }
  `,
})
export class BuilderColor {
  readonly value = input<string | null>(null);
  readonly label = input('Colour');
  readonly allowNone = input(false);
  readonly mode = input<'fill' | 'text'>('fill');
  readonly testId = input('color');
  readonly picked = output<string | null>();

  private readonly store = inject(BuilderStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly open = signal(false);
  protected readonly position = signal({ left: 0, top: 0 });

  protected readonly groups = computed(() => [
    { title: 'Document colours', colors: this.store.documentColors() },
    {
      title: 'Brand colours',
      colors: [...new Set([this.store.design().accentColor.toLowerCase(), ...BRAND_COLORS])],
    },
    { title: 'Default colours', colors: PALETTE },
  ]);

  protected toggle(event: MouseEvent): void {
    if (this.open()) {
      this.open.set(false);
      return;
    }
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const width = 252;
    this.position.set({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      top: Math.min(rect.bottom + 8, window.innerHeight - 380),
    });
    this.open.set(true);
  }

  protected outside(event: PointerEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
    }
  }

  protected choose(color: string | null): void {
    this.picked.emit(color);
  }

  protected pick(event: Event): void {
    this.picked.emit((event.target as HTMLInputElement).value.toLowerCase());
  }

  protected hex(event: Event): void {
    let value = (event.target as HTMLInputElement).value.trim().toLowerCase();
    if (value && !value.startsWith('#')) {
      value = `#${value}`;
    }
    if (/^#[0-9a-f]{3}$/.test(value)) {
      value = `#${[...value.slice(1)].map((c) => c + c).join('')}`;
    }
    if (isHexColor(value)) {
      this.picked.emit(value);
    }
  }
}
