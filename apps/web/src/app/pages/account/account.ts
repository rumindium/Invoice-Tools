import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../core/auth.service';
import { apiErrorMessage } from '../../core/http-error';

@Component({
  selector: 'app-account',
  imports: [ReactiveFormsModule],
  templateUrl: './account.html',
  styleUrl: './account.scss',
})
export class AccountPage {
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);

  protected readonly user = this.auth.user;
  protected readonly workspace = this.auth.workspace;

  protected readonly profileForm = this.fb.nonNullable.group({
    displayName: [
      this.user()?.displayName ?? '',
      [Validators.required, Validators.minLength(2), Validators.maxLength(80)],
    ],
  });

  protected readonly passwordForm = this.fb.nonNullable.group({
    currentPassword: ['', [Validators.required]],
    newPassword: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(128)]],
    confirmPassword: ['', [Validators.required]],
  });

  protected readonly savingProfile = signal(false);
  protected readonly savingPassword = signal(false);
  protected readonly profileError = signal<string | null>(null);
  protected readonly profileSaved = signal(false);
  protected readonly passwordError = signal<string | null>(null);
  protected readonly passwordSaved = signal(false);

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

  protected readonly verified = computed(() => Boolean(this.user()?.emailVerifiedAt));

  protected readonly memberSince = computed(() => {
    const createdAt = this.user()?.createdAt;
    if (!createdAt) return '—';

    return new Intl.DateTimeFormat('en-US', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(createdAt));
  });

  constructor() {
    // The session arrives with the guard, so keep the field in sync with it.
    effect(() => {
      const displayName = this.user()?.displayName;
      if (displayName) {
        this.profileForm.controls.displayName.setValue(displayName, { emitEvent: false });
      }
    });
  }

  protected async saveProfile(): Promise<void> {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }

    this.savingProfile.set(true);
    this.profileError.set(null);
    this.profileSaved.set(false);

    try {
      await this.auth.updateProfile(this.profileForm.controls.displayName.value.trim());
      this.profileSaved.set(true);
    } catch (error) {
      this.profileError.set(apiErrorMessage(error));
    } finally {
      this.savingProfile.set(false);
    }
  }

  protected async savePassword(): Promise<void> {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    const { currentPassword, newPassword, confirmPassword } = this.passwordForm.getRawValue();

    if (newPassword !== confirmPassword) {
      this.passwordError.set('The new passwords do not match.');
      return;
    }

    this.savingPassword.set(true);
    this.passwordError.set(null);
    this.passwordSaved.set(false);

    try {
      await this.auth.changePassword(currentPassword, newPassword);
      this.passwordForm.reset({ currentPassword: '', newPassword: '', confirmPassword: '' });
      this.passwordSaved.set(true);
    } catch (error) {
      this.passwordError.set(apiErrorMessage(error));
    } finally {
      this.savingPassword.set(false);
    }
  }

  protected logout(): void {
    void this.auth.logout();
  }
}
