import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CustomerDetail, CustomerService, CustomerType } from '../../core/customer.service';
import { formatDate, formatIdr } from '../../core/format';
import { apiErrorMessage } from '../../core/http-error';
import { STATUS_LABEL, displayStatus, statusClass } from '../../core/invoice.service';

@Component({
  selector: 'app-customer-detail',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './customer-detail.html',
  styleUrl: './customer-detail.scss',
})
export class CustomerDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly customersApi = inject(CustomerService);

  protected readonly detail = signal<CustomerDetail | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly actionError = signal('');

  protected readonly editing = signal(false);
  protected readonly saving = signal(false);
  protected readonly formError = signal('');

  protected readonly contactEditorOpen = signal(false);
  protected readonly editingContactId = signal<string | null>(null);
  protected readonly contactSaving = signal(false);
  protected readonly contactError = signal('');

  protected readonly formatDate = formatDate;
  protected readonly formatIdr = formatIdr;
  protected readonly statusLabel = STATUS_LABEL;
  protected readonly statusClass = statusClass;
  protected readonly displayStatus = displayStatus;

  protected readonly customer = computed(() => this.detail()?.customer ?? null);
  protected readonly stats = computed(() => this.detail()?.stats ?? null);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(160)]],
    type: ['BUSINESS' as CustomerType, Validators.required],
    email: [''],
    phone: [''],
    address: [''],
    taxId: [''],
    notes: [''],
  });

  protected readonly contactForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
    jobTitle: [''],
    phone: [''],
  });

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe(() => void this.load());
  }

  protected typeLabel(type: CustomerType): string {
    return type === 'BUSINESS' ? 'Company' : 'Individual';
  }

  protected openEdit(): void {
    const customer = this.customer();
    if (!customer) return;

    this.form.reset({
      name: customer.name,
      type: customer.type,
      email: customer.email ?? '',
      phone: customer.phone ?? '',
      address: customer.address ?? '',
      taxId: customer.taxId ?? '',
      notes: customer.notes ?? '',
    });
    this.formError.set('');
    this.editing.set(true);
  }

  protected closeEdit(): void {
    this.editing.set(false);
    this.formError.set('');
  }

  protected async saveProfile(): Promise<void> {
    const customer = this.customer();
    if (!customer) return;

    this.formError.set('');

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.formError.set('Customer name is required (at least 2 characters).');
      return;
    }

    const value = this.form.getRawValue();
    this.saving.set(true);

    try {
      await this.customersApi.update(customer.id, {
        type: value.type,
        name: value.name,
        email: value.email || undefined,
        phone: value.phone || undefined,
        address: value.address || undefined,
        taxId: value.taxId || undefined,
        notes: value.notes || undefined,
      });

      this.editing.set(false);
      await this.load();
    } catch (error) {
      this.formError.set(apiErrorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  protected openContactCreate(): void {
    this.contactForm.reset({ name: '', jobTitle: '', phone: '' });
    this.editingContactId.set(null);
    this.contactError.set('');
    this.contactEditorOpen.set(true);
  }

  protected openContactEdit(contactId: string): void {
    const contact = this.customer()?.contacts.find((item) => item.id === contactId);
    if (!contact) return;

    this.contactForm.reset({
      name: contact.name,
      jobTitle: contact.jobTitle ?? '',
      phone: contact.phone ?? '',
    });
    this.editingContactId.set(contactId);
    this.contactError.set('');
    this.contactEditorOpen.set(true);
  }

  protected closeContactEditor(): void {
    this.contactEditorOpen.set(false);
    this.editingContactId.set(null);
    this.contactError.set('');
  }

  protected async saveContact(): Promise<void> {
    const customer = this.customer();
    if (!customer) return;

    this.contactError.set('');

    if (this.contactForm.invalid) {
      this.contactForm.markAllAsTouched();
      this.contactError.set('PIC name is required (at least 2 characters).');
      return;
    }

    const value = this.contactForm.getRawValue();
    const payload = {
      name: value.name,
      jobTitle: value.jobTitle || undefined,
      phone: value.phone || undefined,
    };

    this.contactSaving.set(true);

    try {
      const editingContactId = this.editingContactId();
      if (editingContactId) {
        await this.customersApi.updateContact(customer.id, editingContactId, payload);
      } else {
        await this.customersApi.addContact(customer.id, payload);
      }

      this.closeContactEditor();
      await this.load();
    } catch (error) {
      this.contactError.set(apiErrorMessage(error));
    } finally {
      this.contactSaving.set(false);
    }
  }

  protected async removeContact(contactId: string, name: string): Promise<void> {
    const customer = this.customer();
    if (!customer) return;

    if (!confirm(`Remove ${name} as a PIC for this customer?`)) {
      return;
    }

    this.actionError.set('');

    try {
      await this.customersApi.removeContact(customer.id, contactId);
      await this.load();
    } catch (error) {
      this.actionError.set(apiErrorMessage(error));
    }
  }

  protected async removeCustomer(): Promise<void> {
    const customer = this.customer();
    if (!customer) return;

    if (!confirm(`Archive ${customer.name}? Their invoices stay in My invoices.`)) {
      return;
    }

    this.actionError.set('');

    try {
      await this.customersApi.archive(customer.id);
      await this.router.navigate(['/customers']);
    } catch (error) {
      this.actionError.set(apiErrorMessage(error));
    }
  }

  private async load(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    this.loading.set(true);
    this.loadError.set('');
    this.editing.set(false);
    this.closeContactEditor();

    if (!id) {
      this.loadError.set('Customer not found.');
      this.loading.set(false);
      return;
    }

    try {
      this.detail.set(await this.customersApi.detail(id));
    } catch (error) {
      this.loadError.set(apiErrorMessage(error));
      this.detail.set(null);
    } finally {
      this.loading.set(false);
    }
  }
}
