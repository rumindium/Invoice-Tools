import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../../core/auth.service';
import { CompanyProfileService, DEFAULT_COMPANY_LOGO } from '../../../core/company-profile.service';

const MAX_LOGO_BYTES = 1_500_000;
const ALLOWED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

@Component({
  selector: 'app-company-profile-card',
  imports: [ReactiveFormsModule],
  templateUrl: './company-profile-card.html',
  styleUrl: './company-profile-card.scss',
})
export class CompanyProfileCard {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly profiles = inject(CompanyProfileService);

  protected readonly defaultLogo = DEFAULT_COMPANY_LOGO;
  protected readonly saved = signal(false);
  protected readonly saveError = signal('');
  protected readonly logoError = signal('');
  protected readonly logoPreview = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    companyName: ['', [Validators.required, Validators.maxLength(120)]],
    address: ['', [Validators.required, Validators.maxLength(300)]],
    phone: ['', [Validators.required, Validators.maxLength(30)]],
  });

  constructor() {
    const profile = this.profiles.load(this.auth.workspace()?.id ?? null);
    this.form.patchValue({
      companyName: profile.companyName,
      address: profile.address,
      phone: profile.phone,
    });
    this.logoPreview.set(profile.logoUrl);

    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.saved.set(false);
      this.saveError.set('');
    });
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
      this.logoError.set('The logo must be 1.5 MB or smaller.');
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

  protected submit(): void {
    this.saveError.set('');

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.saveError.set('Complete the company name, address, and phone number.');
      return;
    }

    const saved = this.profiles.save(this.auth.workspace()?.id ?? null, {
      ...this.form.getRawValue(),
      logoUrl: this.logoPreview(),
    });

    if (!saved) {
      this.saveError.set('The profile could not be saved in this browser.');
      return;
    }

    this.saved.set(true);
  }
}
