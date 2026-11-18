import { Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthLayout } from '../../layouts/auth-layout';
import { apiErrorMessage } from '../../core/http-error';
import { AuthService } from '../../core/auth.service';

function passwordsMatch(control: AbstractControl): ValidationErrors | null {
  const password = control.get('password')?.value;
  const confirmation = control.get('confirmPassword')?.value;

  if (!confirmation) {
    return null;
  }

  return password === confirmation ? null : { passwordsMismatch: true };
}

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink, AuthLayout],
  templateUrl: './register.html',
  styleUrl: './register.scss',
})
export class RegisterPage {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);

  protected readonly form = this.fb.nonNullable.group(
    {
      displayName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(80)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: passwordsMatch },
  );

  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly showPassword = signal(false);
  protected readonly sentTo = signal<string | null>(null);
  protected readonly resending = signal(false);
  protected readonly resent = signal(false);
  protected readonly resendError = signal<string | null>(null);

  protected get displayName() {
    return this.form.controls.displayName;
  }

  protected get email() {
    return this.form.controls.email;
  }

  protected get password() {
    return this.form.controls.password;
  }

  protected get confirmPassword() {
    return this.form.controls.confirmPassword;
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.error.set(null);

    try {
      const { displayName, email, password } = this.form.getRawValue();
      const response = await this.auth.register({ displayName, email, password });
      this.sentTo.set(response.email);
    } catch (error) {
      this.error.set(apiErrorMessage(error));
    } finally {
      this.submitting.set(false);
    }
  }

  protected async resend(): Promise<void> {
    const email = this.sentTo();
    if (!email || this.resending()) {
      return;
    }

    this.resending.set(true);
    this.resendError.set(null);

    try {
      await this.auth.resendVerification(email);
      this.resent.set(true);
    } catch (error) {
      this.resendError.set(apiErrorMessage(error));
    } finally {
      this.resending.set(false);
    }
  }

  protected togglePassword(): void {
    this.showPassword.update((visible) => !visible);
  }
}
