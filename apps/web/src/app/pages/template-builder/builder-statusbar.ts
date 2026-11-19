import { Component, computed, inject } from '@angular/core';
import { BuilderIcon } from './builder-icon';
import { pageLabel } from './builder.model';
import { BuilderStore } from './builder.store';

/** The studio's status bar: page facts, selection count, rulers/margins toggles and zoom. */
@Component({
  selector: 'app-builder-statusbar',
  imports: [BuilderIcon],
  template: `
    <footer class="statusbar">
      <span class="status-chip" data-testid="page-info">
        {{ pageInfo() }} · {{ store.elements().length }} elements
      </span>
      @if (store.selection().length) {
        <span class="status-chip is-accent" data-testid="selection-info">
          {{ store.selection().length }} selected
        </span>
      }
      <span class="status-spacer"></span>
      <button
        type="button"
        class="status-btn"
        title="Show rulers"
        aria-label="Show rulers"
        data-testid="toggle-rulers"
        [class.is-on]="store.showRulers()"
        [attr.aria-pressed]="store.showRulers()"
        (click)="store.showRulers.set(!store.showRulers())"
      >
        <app-tb-icon name="ruler" [size]="16" />
      </button>
      <button
        type="button"
        class="status-btn"
        title="Show margins"
        aria-label="Show margins"
        [class.is-on]="store.showMargins()"
        [attr.aria-pressed]="store.showMargins()"
        (click)="store.showMargins.set(!store.showMargins())"
      >
        <app-tb-icon name="margins" [size]="16" />
      </button>
      <span class="status-sep" aria-hidden="true"></span>
      <button
        type="button"
        class="status-btn"
        aria-label="Zoom out"
        data-testid="zoom-out"
        (click)="store.zoomBy(1 / 1.2)"
      >
        <app-tb-icon name="minus" [size]="16" />
      </button>
      <input
        class="zoom-slider"
        type="range"
        min="10"
        max="300"
        aria-label="Zoom"
        data-testid="zoom-slider"
        [value]="zoomPercent()"
        (input)="zoomInput($event)"
      />
      <button
        type="button"
        class="status-btn"
        aria-label="Zoom in"
        data-testid="zoom-in"
        (click)="store.zoomBy(1.2)"
      >
        <app-tb-icon name="plus" [size]="16" />
      </button>
      <button
        type="button"
        class="zoom-label"
        title="Fit page (Ctrl+0)"
        data-testid="zoom-label"
        [class.is-fit]="store.zoomMode() === 'fit'"
        (click)="store.fitZoom()"
      >
        {{ zoomPercent() }}%
      </button>
      <button
        type="button"
        class="status-btn"
        title="Fit page"
        aria-label="Fit page"
        (click)="store.fitZoom()"
      >
        <app-tb-icon name="fit" [size]="16" />
      </button>
    </footer>
  `,
  styles: `
    :host {
      display: block;
      flex: none;
    }

    .statusbar {
      display: flex;
      height: 38px;
      flex: none;
      align-items: center;
      gap: 4px;
      border-top: 1px solid var(--st-line);
      background: var(--st-surface);
      padding: 0 10px;
      color: var(--st-muted);
      font-size: 12px;
    }

    .status-chip {
      min-width: 0;
      overflow: hidden;
      border-radius: 6px;
      background: var(--st-surface-2);
      padding: 3px 8px;
      font-family: var(--font-mono);
      font-size: 11px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .status-chip.is-accent {
      flex: none;
      background: var(--st-accent-soft);
      color: var(--st-accent-ink);
    }

    .status-spacer {
      flex: 1;
    }

    .status-btn,
    .zoom-label {
      display: inline-flex;
      height: 28px;
      align-items: center;
      justify-content: center;
      border: 0;
      cursor: pointer;
      white-space: nowrap;
      min-width: 28px;
      border-radius: 7px;
      background: none;
      color: var(--st-muted);
    }

    .status-btn:hover,
    .zoom-label:hover {
      background: var(--st-surface-2);
      color: var(--st-text);
    }

    .status-btn.is-on {
      background: var(--st-accent-soft);
      color: var(--st-accent);
    }

    .status-sep {
      width: 1px;
      height: 18px;
      flex: none;
      margin: 0 4px;
      background: var(--st-line);
    }

    .zoom-slider {
      width: 128px;
      accent-color: var(--st-accent);
    }

    .zoom-label {
      width: 54px;
      border: 1px solid var(--st-line);
      font-family: var(--font-mono);
      font-size: 11.5px;
      font-weight: 600;
    }

    .zoom-label.is-fit {
      border-color: var(--st-accent-line);
      color: var(--st-accent-ink);
    }

    @media (max-width: 900px) {
      .zoom-slider,
      .status-chip {
        display: none;
      }
    }
  `,
})
export class BuilderStatusbar {
  protected readonly store = inject(BuilderStore);
  protected readonly pageInfo = computed(() => pageLabel(this.store.design().page));
  protected readonly zoomPercent = computed(() => Math.round(this.store.zoom() * 100));

  protected zoomInput(event: Event): void {
    this.store.setZoom(Number((event.target as HTMLInputElement).value) / 100);
  }
}
