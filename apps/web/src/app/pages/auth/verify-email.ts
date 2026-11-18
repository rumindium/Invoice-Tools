import { Component, afterNextRender, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthLayout } from '../../layouts/auth-layout';
import { apiErrorMessage } from '../../core/http-error';
import { AuthService } from '../../core/auth.service';

type VerifyState = 'verifying' | 'verified' | 'failed' | 'missing';

@Component({
  selector: 'app-verify-email',
  imports: [ReactiveFormsModule, RouterLink, AuthLayout],
  templateUrl: './verify-email.html',
  styleUrl: './verify-email.scss',
})
export class VerifyEmailPage {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  protected readonly state = signal<VerifyState>('verifying');
  protected readonly error = signal<string | null>(null);
  protected readonly resendForm = this.fb.nonNullable.control('', [
    Validators.required,
    Validators.email,
  ]);
  protected readonly resending = signal(false);
  protected readonly resent = signal(false);

  constructor() {
    // Server rendering must not consume the single-use token: the browser opens it.
    afterNextRender(() => void this.verify());
  }

  protected async submitResend(): Promise<void> {
    if (this.resendForm.invalid || this.resending()) {
      this.resendForm.markAsTouched();
      return;
    }

    this.resending.set(true);

    try {
      await this.auth.resendVerification(this.resendForm.getRawValue());
      this.resent.set(true);
    } catch (error) {
      this.error.set(apiErrorMessage(error));
    } finally {
      this.resending.set(false);
    }
  }

  private async verify(): Promise<void> {
    const token = this.route.snapshot.queryParamMap.get('token');

    if (!token) {
      this.state.set('missing');
      return;
    }

    try {
      await this.auth.verifyEmail(token);
      this.state.set('verified');
    } catch (error) {
      this.error.set(apiErrorMessage(error));
      this.state.set('failed');
    }
  }
}
