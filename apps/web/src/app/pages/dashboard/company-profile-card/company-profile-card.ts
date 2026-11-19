import { Component, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { apiErrorMessage } from '../../../core/http-error';
import { Company, CompanyService, DEFAULT_COMPANY_LOGO } from '../../../core/company.service';

const MAX_LOGO_BYTES = 1_000_000;
const ALLOWED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

@Component({
  selector: 'app-company-profile-card',
  imports: [ReactiveFormsModule],
  templateUrl: './company-profile-card.html',
  styleUrl: './company-profile-card.scss',
})
export class CompanyProfileCard {
  private readonly fb = inject(FormBuilder);
  private readonly companies = inject(CompanyService);

  protected readonly defaultLogo = DEFAULT_COMPANY_LOGO;
  protected readonly saved = signal(false);
  protected readonly saving = signal(false);
  protected readonly saveError = signal('');
  protected readonly logoError = signal('');
  protected readonly logoPreview = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    companyName: ['', [Validators.required, Validators.maxLength(160)]],
    address: ['', [Validators.required, Validators.maxLength(400)]],
    phone: ['', [Validators.required, Validators.maxLength(40)]],
  });

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.saved.set(false);
      this.saveError.set('');
    });

    void this.companies.ensureLoaded();
    // Follow the saved profile (e.g. completed in the welcome banner) unless the user is editing.
    effect(() => {
      const company = this.companies.company();
      if (company && this.form.pristine) {
        this.hydrate(company);
      }
    });
  }

  private hydrate(company: Company): void {
    this.form.patchValue(
      {
        companyName: company.legalName,
        address: company.address ?? '',
        phone: company.phone ?? '',
      },
      { emitEvent: false },
    );
    this.logoPreview.set(company.logoDataUrl);
  }

  protected onLogoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    this.logoError.set('');
    this.saved.set(false);

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
        this.logoPreview.set(reader.result);
      }
    };
    reader.onerror = () => this.logoError.set('The logo could not be read. Try another file.');
    reader.readAsDataURL(file);
  }

  protected removeLogo(): void {
    this.logoPreview.set(null);
    this.saved.set(false);
  }

  protected async submit(): Promise<void> {
    this.saveError.set('');

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.saveError.set('Complete the company name, address, and phone number.');
      return;
    }

    this.saving.set(true);

    try {
      const value = this.form.getRawValue();
      await this.companies.save({
        legalName: value.companyName,
        address: value.address,
        phone: value.phone,
        logoDataUrl: this.logoPreview() ?? undefined,
      });
      this.saved.set(true);
      this.form.markAsPristine();
    } catch (error) {
      this.saveError.set(apiErrorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }
}
