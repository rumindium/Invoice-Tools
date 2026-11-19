import { Component, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { CompanyService } from '../core/company.service';
import { FeedbackService } from '../core/feedback.service';
import { GoodsReceiptService } from '../core/goods-receipt.service';
import { InvoiceService } from '../core/invoice.service';
import { QuotationService } from '../core/quotation.service';
import { WelcomeBanner } from '../ui/welcome/welcome-banner';

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/quotations': 'My Quotations',
  '/quotations/new': 'New Quotation',
  '/goods-receipts': 'My Goods Receipts',
  '/goods-receipts/new': 'New Goods Receipt',
  '/documents': 'My Invoices',
  '/invoices/new': 'New Invoice',
  '/company': 'Company',
  '/feedback': 'Feedback',
  '/feedback/new': 'Log Feedback',
  '/activity': 'Activity',
  '/account': 'Account',
  '/customers': 'Customers',
  '/items': 'Items',
  '/templates/quotations': 'Quotation Templates',
  '/templates/goods-receipts': 'Goods Receipt Templates',
  '/templates/invoices': 'Invoice Templates',
  '/templates/builder': 'Template Builder',
};

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, WelcomeBanner],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
})
export class AppShell {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly invoicesApi = inject(InvoiceService);
  private readonly quotationsApi = inject(QuotationService);
  private readonly goodsReceiptsApi = inject(GoodsReceiptService);
  private readonly feedbackApi = inject(FeedbackService);
  private readonly companies = inject(CompanyService);

  /**
   * The welcome banner opens whenever the company profile is incomplete and closes only when
   * the banner itself finishes (profile saved, user continued). It is not skippable.
   */
  protected readonly welcomeOpen = signal(false);

  protected readonly user = this.auth.user;
  protected readonly workspace = this.auth.workspace;
  protected readonly navOpen = signal(false);
  protected readonly currentUrl = signal(this.router.url);
  protected readonly invoiceCount = computed(
    () => this.invoicesApi.summary()?.totalInvoices ?? this.invoicesApi.invoices.length,
  );

  protected readonly quotationCount = computed(
    () => this.quotationsApi.summary()?.totalQuotations ?? this.quotationsApi.quotations().length,
  );

  protected readonly goodsReceiptCount = computed(
    () => this.goodsReceiptsApi.summary()?.totalReceipts ?? this.goodsReceiptsApi.receipts().length,
  );

  /** Feedback that still needs handling (new or in progress). */
  protected readonly openFeedbackCount = computed(() => this.feedbackApi.summary()?.open ?? 0);

  protected readonly pageTitle = computed(() => {
    const url = this.currentUrl().split('?')[0];
    const known = PAGE_TITLES[url];

    if (known) return known;
    if (url.startsWith('/quotations/')) return 'Quotation';
    if (url.startsWith('/goods-receipts/')) return 'Goods Receipt';
    if (url.startsWith('/documents/')) return 'Invoice';
    if (url.startsWith('/invoices/')) return 'New Invoice';
    if (url.startsWith('/customers/')) return 'Customer';
    if (url.startsWith('/feedback/')) return 'Feedback';
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
    // Always re-read the company: the service outlives a sign-out and another user's sign-in.
    void this.companies.ensureLoaded(true);
    effect(() => {
      if (this.companies.loaded() && !this.companies.profileComplete()) {
        this.welcomeOpen.set(true);
      }
    });

    void this.invoicesApi.loadSummary();
    void this.quotationsApi.loadSummary();
    void this.goodsReceiptsApi.loadSummary();
    void this.feedbackApi.loadSummary();

    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        this.currentUrl.set(this.router.url);
        this.navOpen.set(false);
        void this.invoicesApi.loadSummary();
        void this.quotationsApi.loadSummary();
        void this.goodsReceiptsApi.loadSummary();
        void this.feedbackApi.loadSummary();
      });
  }

  protected welcomeFinished(): void {
    this.welcomeOpen.set(false);
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
