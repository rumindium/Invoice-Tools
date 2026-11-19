import {
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';

const LEAVE_DURATION = 220;

/**
 * Right-side drawer used for create and edit forms, so the page underneath stays visible.
 * The panel is rendered while it animates in or out; `closed` fires when the user dismisses it.
 */
@Component({
  selector: 'app-drawer',
  templateUrl: './drawer.html',
  styleUrl: './drawer.scss',
  host: {
    '(document:keydown.escape)': 'handleEscape()',
  },
})
export class Drawer {
  readonly open = input(false);
  readonly title = input('');
  readonly subtitle = input('');

  readonly closed = output<void>();

  protected readonly rendered = signal(false);
  protected readonly active = signal(false);

  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private readonly destroyRef = inject(DestroyRef);

  private leaveTimer?: ReturnType<typeof setTimeout>;
  private frame = 0;

  constructor() {
    effect(() => {
      const open = this.open();

      if (open) {
        this.cancelLeave();
        untracked(() => this.rendered.set(true));
        this.enter();
      } else if (untracked(this.rendered)) {
        this.leave();
      }
    });

    this.destroyRef.onDestroy(() => {
      this.cancelLeave();
      this.cancelFrame();
      this.unlockScroll();
    });
  }

  protected requestClose(): void {
    this.closed.emit();
  }

  protected handleEscape(): void {
    if (this.open()) {
      this.closed.emit();
    }
  }

  private enter(): void {
    if (typeof requestAnimationFrame !== 'function') {
      this.active.set(true);
      return;
    }

    this.cancelFrame();
    // Two frames: one to paint the closed state, one to let the transition run from it.
    this.frame = requestAnimationFrame(() => {
      this.frame = requestAnimationFrame(() => {
        this.active.set(true);
        this.lockScroll();
        this.panel()?.nativeElement.focus();
      });
    });
  }

  private leave(): void {
    this.active.set(false);
    this.unlockScroll();
    this.cancelLeave();
    this.leaveTimer = setTimeout(() => this.rendered.set(false), LEAVE_DURATION);
  }

  private cancelLeave(): void {
    clearTimeout(this.leaveTimer);
    this.leaveTimer = undefined;
  }

  private cancelFrame(): void {
    if (this.frame && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.frame);
    }

    this.frame = 0;
  }

  private lockScroll(): void {
    if (typeof document !== 'undefined') {
      document.body.style.overflow = 'hidden';
    }
  }

  private unlockScroll(): void {
    if (typeof document !== 'undefined') {
      document.body.style.overflow = '';
    }
  }
}
