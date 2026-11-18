import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { InvoiceService } from '../core/invoice.service';

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/documents': 'My Invoices',
  '/invoices/new': 'New Invoice',
  '/company': 'Company',
  '/account': 'Account',
  '/customers': 'Customers',
  '/items': 'Items',
};

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
})
export class AppShell {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly invoicesApi = inject(InvoiceService);

  protected readonly user = this.auth.user;
  protected readonly workspace = this.auth.workspace;
  protected readonly navOpen = signal(false);
  protected readonly currentUrl = signal(this.router.url);
  protected readonly invoiceCount = computed(
    () => this.invoicesApi.summary()?.totalInvoices ?? this.invoicesApi.invoices.length,
  );

  protected readonly pageTitle = computed(() => {
    const url = this.currentUrl().split('?')[0];
    const known = PAGE_TITLES[url];

    if (known) return known;
    if (url.startsWith('/documents/')) return 'Invoice';
    if (url.startsWith('/invoices/')) return 'New Invoice';
    if (url.startsWith('/customers/')) return 'Customer';
    if (url.startsWith('/items/')) return 'Item';

    return 'Dashboard';
  });

  protected readonly initials = computed(() => {
    const name = this.user()?.displayName ?? 'RI';
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
  });

  protected readonly today = new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  constructor() {
    void this.invoicesApi.loadSummary();

    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        this.currentUrl.set(this.router.url);
        this.navOpen.set(false);
        void this.invoicesApi.loadSummary();
      });
  }

  protected toggleNav(): void {
    this.navOpen.update((open) => !open);
  }

  protected closeNav(): void {
    this.navOpen.set(false);
  }

  protected logout(): void {
    void this.auth.logout();
  }
}
