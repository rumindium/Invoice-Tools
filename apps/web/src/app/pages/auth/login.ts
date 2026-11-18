import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthLayout } from '../../layouts/auth-layout';
import { apiErrorMessage } from '../../core/http-error';
import { AuthService } from '../../core/auth.service';

function isUnverifiedEmail(error: unknown): boolean {
  return (
    error instanceof HttpErrorResponse &&
    (error.error as { code?: string } | null)?.code === 'EMAIL_NOT_VERIFIED'
  );
}

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, AuthLayout],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class LoginPage {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly showPassword = signal(false);
  protected readonly needsVerification = signal(false);
  protected readonly resending = signal(false);
  protected readonly resent = signal(false);

  protected get email() {
    return this.form.controls.email;
  }

  protected get password() {
    return this.form.controls.password;
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.error.set(null);
    this.needsVerification.set(false);
    this.resent.set(false);

    try {
      await this.auth.login(this.form.getRawValue());
      const returnTo = this.route.snapshot.queryParamMap.get('returnTo');
      const target =
        returnTo?.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/dashboard';
      await this.router.navigateByUrl(target);
    } catch (error) {
      this.needsVerification.set(isUnverifiedEmail(error));
      this.error.set(apiErrorMessage(error));
    } finally {
      this.submitting.set(false);
    }
  }

  protected async resend(): Promise<void> {
    const email = this.form.controls.email.value;
    if (!email || this.resending()) {
      return;
    }

    this.resending.set(true);

    try {
      await this.auth.resendVerification(email);
      this.resent.set(true);
    } catch (error) {
      this.error.set(apiErrorMessage(error));
    } finally {
      this.resending.set(false);
    }
  }

  protected togglePassword(): void {
    this.showPassword.update((visible) => !visible);
  }
}
