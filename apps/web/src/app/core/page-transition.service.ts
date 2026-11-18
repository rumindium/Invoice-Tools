import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

const ENTER_DURATION = 0.34;
const ENTER_EASING = [0.22, 1, 0.36, 1] as const;

/**
 * Fades and lifts the page component in on every navigation, using Motion (the engine behind
 * Framer Motion). The router outlet inserts the activated component right after the outlet, so
 * the deepest such element is the page itself; the app shell around it is left untouched.
 */
@Injectable({ providedIn: 'root' })
export class PageTransitionService {
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);

  private motion: Promise<typeof import('motion')> | null = null;
  private navigations = 0;

  constructor() {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        this.navigations += 1;

        // The first navigation is the hydration of server-rendered HTML; animating it would flash.
        if (this.navigations === 1) {
          return;
        }

        void this.animatePage();
      });
  }

  private async animatePage(): Promise<void> {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    const page = this.activePage();

    if (!page) {
      return;
    }

    this.motion ??= import('motion');
    const { animate } = await this.motion;

    animate(
      page,
      { opacity: [0, 1], y: [14, 0] },
      { duration: ENTER_DURATION, ease: [...ENTER_EASING] },
    );
  }

  private activePage(): HTMLElement | null {
    const hosts = document.querySelectorAll<HTMLElement>('router-outlet + *');

    return hosts.length > 0 ? hosts[hosts.length - 1] : null;
  }
}
