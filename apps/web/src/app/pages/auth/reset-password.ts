import { Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
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
  selector: 'app-reset-password',
  imports: [ReactiveFormsModule, RouterLink, AuthLayout],
  templateUrl: './reset-password.html',
  styleUrl: './reset-password.scss',
})
export class ResetPasswordPage {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly token = this.route.snapshot.queryParamMap.get('token') ?? '';

  protected readonly form = this.fb.nonNullable.group(
    {
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: passwordsMatch },
  );

  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly done = signal(false);
  protected readonly showPassword = signal(false);
  protected readonly hasToken = this.token.length > 0;

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
      await this.auth.resetPassword(this.token, this.form.controls.password.value);
      this.done.set(true);
    } catch (error) {
      this.error.set(apiErrorMessage(error));
    } finally {
      this.submitting.set(false);
    }
  }

  protected togglePassword(): void {
    this.showPassword.update((visible) => !visible);
  }
}
