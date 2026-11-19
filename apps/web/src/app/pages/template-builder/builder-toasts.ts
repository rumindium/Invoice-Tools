import { Component, inject } from '@angular/core';
import { BuilderIcon } from './builder-icon';
import { BuilderStore } from './builder.store';

/** Short confirmations and errors, floating above the status bar. */
@Component({
  selector: 'app-builder-toasts',
  imports: [BuilderIcon],
  template: `
    <div class="toasts" aria-live="polite">
      @for (toast of store.toasts(); track toast.id) {
        <div
          class="toast"
          [class.is-error]="toast.tone === 'error'"
          role="status"
          data-testid="toast"
        >
          <span>{{ toast.message }}</span>
          <button type="button" aria-label="Dismiss" (click)="store.dismissToast(toast.id)">
            <app-tb-icon name="close" [size]="14" />
          </button>
        </div>
      }
    </div>
  `,
  styles: `
    .toasts {
      position: fixed;
      bottom: 54px;
      left: 50%;
      z-index: 90;
      display: grid;
      justify-items: center;
      gap: 8px;
      transform: translateX(-50%);
      pointer-events: none;
    }

    .toast {
      display: flex;
      align-items: center;
      gap: 10px;
      border-radius: 10px;
      background: var(--st-text);
      padding: 9px 10px 9px 14px;
      color: #fff;
      font-size: 12.5px;
      font-weight: 500;
      box-shadow: 0 12px 30px -10px rgba(0, 0, 0, 0.45);
      pointer-events: auto;
      animation: toast-in 180ms ease-out;
    }

    .toast button {
      display: grid;
      border: 0;
      background: none;
      color: #9ca3af;
      cursor: pointer;
    }

    .toast.is-error {
      background: #b91c1c;
    }

    .toast.is-error button {
      color: #fecaca;
    }

    @keyframes toast-in {
      from {
        opacity: 0;
        transform: translateY(8px);
      }
    }
  `,
})
export class BuilderToasts {
  protected readonly store = inject(BuilderStore);
}
