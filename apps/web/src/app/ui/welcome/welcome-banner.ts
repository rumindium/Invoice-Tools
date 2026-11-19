import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  PLATFORM_ID,
  afterNextRender,
  computed,
  inject,
  output,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../core/auth.service';
import { CompanyService } from '../../core/company.service';
import { apiErrorMessage } from '../../core/http-error';
import { WelcomeArt, WelcomeArtKind } from './welcome-art';

interface SlidePoint {
  title: string;
  text: string;
  /** Short mark shown instead of the check icon ("Q", "GR", "INV"). */
  badge?: string;
}

interface Slide {
  id: WelcomeArtKind;
  /** Step name for the progress dots. */
  step: string;
  eyebrow: string;
  title: string;
  body: string;
  points: SlidePoint[];
  /** Illustration colours: --art-a, --art-b, --art-c. */
  colors: [string, string, string];
}

const MAX_LOGO_BYTES = 1_000_000;
const ALLOWED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Onboarding shown over the workspace until the company profile is complete: an
 * introduction, the main features and the company profile form. It cannot be dismissed —
 * no close control, Escape does nothing, focus stays inside and the page behind is inert —
 * and it reappears on every visit until the profile has a name, address and phone.
 */
@Component({
  selector: 'app-welcome-banner',
  imports: [ReactiveFormsModule, WelcomeArt],
  templateUrl: './welcome-banner.html',
  styleUrls: ['./welcome-banner.scss', './welcome-form.scss'],
})
export class WelcomeBanner {
  private readonly fb = inject(FormBuilder);
  private readonly companies = inject(CompanyService);
  private readonly auth = inject(AuthService);
  private readonly document = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** The profile is saved and the user chose to start: the shell removes the banner. */
  readonly finished = output<void>();

  private readonly dialog = viewChild.required<ElementRef<HTMLElement>>('dialog');
  private readonly headings = viewChildren<ElementRef<HTMLElement>>('heading');

  protected readonly slides: Slide[] = [
    {
      id: 'welcome',
      step: 'Welcome',
      eyebrow: 'Welcome aboard',
      title: 'Welcome to Rumindium Invoice',
      body: 'Create quotations, record deliveries and send invoices that look as good as the work you do — all from one workspace built for small businesses.',
      points: [
        { title: 'From quote to cash', text: 'Every sales document in one connected place.' },
        { title: 'Branded PDFs', text: 'A4 documents with your logo, ready to send.' },
        { title: 'Always up to date', text: 'See what is open, paid and overdue at a glance.' },
      ],
      colors: ['#4f46e5', '#7c3aed', '#22c55e'],
    },
    {
      id: 'flow',
      step: 'Documents',
      eyebrow: 'One connected flow',
      title: 'Quote, deliver, invoice — without retyping',
      body: 'Each document builds on the last. An accepted quotation becomes a goods receipt, and the received goods become an invoice in one click.',
      points: [
        { badge: 'Q', title: 'Quotations', text: 'Validity dates, signatures and versions.' },
        {
          badge: 'GR',
          title: 'Goods receipts',
          text: 'Count, accept or reject every delivered item.',
        },
        { badge: 'INV', title: 'Invoices', text: 'Bill what was accepted at the quoted prices.' },
      ],
      colors: ['#2563eb', '#0891b2', '#059669'],
    },
    {
      id: 'brand',
      step: 'Branding',
      eyebrow: 'Make it yours',
      title: 'Documents that carry your brand',
      body: 'Pick one of five templates for each document type and colour it in your brand — every PDF is generated with it automatically.',
      points: [
        { title: 'Five templates', text: 'Classic, Modern, Minimal, Elegant and Bold.' },
        { title: 'Your colours', text: 'Any accent colour, with readable text guaranteed.' },
        { title: 'Your letterhead', text: 'Logo, address and signatory on every page.' },
      ],
      colors: ['#db2777', '#ea580c', '#7c3aed'],
    },
    {
      id: 'track',
      step: 'Tracking',
      eyebrow: 'Stay in control',
      title: 'Know what you are owed, always',
      body: 'Your dashboard shows open, paid and overdue totals, and every change is kept in the activity log with full version history.',
      points: [
        { title: 'Live dashboard', text: 'Outstanding and paid totals for the month.' },
        { title: 'Follow-ups', text: 'Log calls and messages until the invoice is paid.' },
        { title: 'History & versions', text: 'Every revision is kept, nothing is lost.' },
      ],
      colors: ['#059669', '#0d9488', '#2563eb'],
    },
    {
      id: 'company',
      step: 'Your company',
      eyebrow: 'Last step',
      title: 'Set up your company profile',
      body: 'This letterhead appears on every quotation, goods receipt and invoice. You can change it any time under Company.',
      points: [],
      colors: ['#ea580c', '#f59e0b', '#4f46e5'],
    },
  ];

  protected readonly index = signal(0);
  protected readonly lastIndex = this.slides.length - 1;
  protected readonly onForm = computed(() => this.index() === this.lastIndex);
  protected readonly current = computed(() => this.slides[this.index()]!);
  protected readonly greeting = computed(() => {
    const name = this.auth.user()?.displayName?.trim().split(/\s+/)[0];
    return name ? `Hi ${name}, welcome to Rumindium Invoice` : 'Welcome to Rumindium Invoice';
  });

  protected readonly form = this.fb.nonNullable.group({
    companyName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(160)]],
    phone: [
      '',
      [Validators.required, Validators.maxLength(40), Validators.pattern(/^[+()\d\s.-]{6,}$/)],
    ],
    address: ['', [Validators.required, Validators.maxLength(400)]],
    email: ['', [Validators.email, Validators.maxLength(254)]],
    taxId: ['', Validators.maxLength(60)],
    signatoryName: ['', Validators.maxLength(120)],
    signatoryTitle: ['', Validators.maxLength(120)],
  });

  protected readonly companyName = toSignal(this.form.controls.companyName.valueChanges, {
    initialValue: '',
  });
  protected readonly logo = signal<string | null>(null);
  protected readonly logoError = signal('');
  protected readonly saving = signal(false);
  protected readonly saveError = signal('');
  protected readonly done = signal(false);
  protected readonly leaving = signal(false);
  protected readonly savedName = signal('');

  constructor() {
    this.prefill();

    if (this.isBrowser) {
      // The page behind must not scroll while the banner is up.
      const body = this.document.body;
      const previous = body.style.overflow;
      body.style.overflow = 'hidden';
      inject(DestroyRef).onDestroy(() => (body.style.overflow = previous));
      afterNextRender(() => this.focusHeading());
    }
  }

  protected slideStyle(slide: Slide): Record<string, string> {
    const [a, b, c] = slide.colors;
    return { '--art-a': a, '--art-b': b, '--art-c': c };
  }

  protected go(index: number): void {
    if (this.done() || index < 0 || index > this.lastIndex || index === this.index()) {
      return;
    }
    this.index.set(index);
    // Move focus to the new heading once the slide is interactive again.
    setTimeout(() => this.focusHeading(), 0);
  }

  protected next(): void {
    this.go(this.index() + 1);
  }

  protected back(): void {
    this.go(this.index() - 1);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      // Not skippable: Escape never closes the welcome banner.
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (event.key === 'Tab') {
      this.trapFocus(event);
      return;
    }

    const target = event.target as HTMLElement;
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
    if (!typing && event.key === 'ArrowRight') {
      event.preventDefault();
      this.next();
    } else if (!typing && event.key === 'ArrowLeft') {
      event.preventDefault();
      this.back();
    }
  }

  protected invalid(name: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || control.dirty);
  }

  protected onLogoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    this.logoError.set('');
    if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
      this.logoError.set('Use a PNG, JPG, or WebP file.');
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      this.logoError.set('The logo must be 1 MB or smaller.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        this.logo.set(reader.result);
      }
    };
    reader.onerror = () => this.logoError.set('The logo could not be read. Try another file.');
    reader.readAsDataURL(file);
  }

  protected removeLogo(): void {
    this.logo.set(null);
    this.logoError.set('');
  }

  protected async submit(): Promise<void> {
    if (this.saving()) return;
    this.saveError.set('');

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.saveError.set('Complete the highlighted fields to finish setting up.');
      this.dialog()
        .nativeElement.querySelector<HTMLElement>('.slide.is-active .ng-invalid:not(form)')
        ?.focus();
      return;
    }

    this.saving.set(true);
    try {
      const value = this.form.getRawValue();
      const optional = (text: string) => text.trim() || undefined;
      const company = await this.companies.save({
        legalName: value.companyName.trim(),
        phone: value.phone.trim(),
        address: value.address.trim(),
        email: optional(value.email),
        taxId: optional(value.taxId),
        signatoryName: optional(value.signatoryName),
        signatoryTitle: optional(value.signatoryTitle),
        logoDataUrl: this.logo() ?? undefined,
      });
      this.savedName.set(company.displayName?.trim() || company.legalName);
      this.done.set(true);
      setTimeout(() => this.focusHeading(), 0);
    } catch (error) {
      this.saveError.set(apiErrorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  /** Plays the exit transition, then hands control back to the workspace. */
  protected finish(): void {
    if (this.leaving()) return;
    this.leaving.set(true);
    const reduced =
      this.isBrowser && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    setTimeout(() => this.finished.emit(), reduced ? 0 : 360);
  }

  protected signOut(): void {
    void this.auth.logout();
  }

  /** A partly filled profile (e.g. only a name) is completed, not typed again. */
  private prefill(): void {
    const company = this.companies.company();
    if (!company) return;
    this.form.patchValue({
      companyName: company.legalName ?? '',
      phone: company.phone ?? '',
      address: company.address ?? '',
      email: company.email ?? '',
      taxId: company.taxId ?? '',
      signatoryName: company.signatoryName ?? '',
      signatoryTitle: company.signatoryTitle ?? '',
    });
    this.logo.set(company.logoDataUrl);
  }

  private focusHeading(): void {
    this.headings()[this.index()]?.nativeElement.focus({ preventScroll: true });
  }

  private trapFocus(event: KeyboardEvent): void {
    const focusable = Array.from(
      this.dialog().nativeElement.querySelectorAll<HTMLElement>(FOCUSABLE),
    ).filter((element) => !element.closest('[inert]') && element.offsetParent !== null);
    if (!focusable.length) return;

    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    const active = this.document.activeElement;
    if (event.shiftKey && (active === first || !this.dialog().nativeElement.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
