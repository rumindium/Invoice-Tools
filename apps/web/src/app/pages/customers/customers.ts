import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  CustomerListRow,
  CustomerService,
  CustomerSummary,
  CustomerType,
} from '../../core/customer.service';
import { formatDate, formatIdr } from '../../core/format';
import { apiErrorMessage } from '../../core/http-error';
import { BarChart } from '../../ui/bar-chart/bar-chart';

@Component({
  selector: 'app-customers',
  imports: [ReactiveFormsModule, RouterLink, BarChart],
  templateUrl: './customers.html',
  styleUrl: './customers.scss',
})
export class CustomersPage {
  private readonly fb = inject(FormBuilder);
  private readonly customersApi = inject(CustomerService);

  protected readonly rows = signal<CustomerListRow[]>([]);
  protected readonly summary = signal<CustomerSummary | null>(null);
  protected readonly loading = signal(true);
  protected readonly listError = signal('');
  protected readonly search = signal('');
  protected readonly actionError = signal('');

  protected readonly editorOpen = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly formError = signal('');

  protected readonly formatDate = formatDate;
  protected readonly formatIdr = formatIdr;

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(160)]],
    type: ['BUSINESS' as CustomerType, Validators.required],
    email: [''],
    phone: [''],
    address: [''],
    taxId: [''],
    notes: [''],
  });

  private searchTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    void this.reload();
  }

  protected updateSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => void this.reload(), 250);
  }

  protected clearSearch(): void {
    this.search.set('');
    void this.reload();
  }

  protected openCreate(): void {
    this.form.reset({
      name: '',
      type: 'BUSINESS',
      email: '',
      phone: '',
      address: '',
      taxId: '',
      notes: '',
    });
    this.editingId.set(null);
    this.formError.set('');
    this.editorOpen.set(true);
  }

  protected openEdit(row: CustomerListRow): void {
    this.form.reset({
      name: row.name,
      type: row.type,
      email: row.email ?? '',
      phone: row.phone ?? '',
      address: row.address ?? '',
      taxId: row.taxId ?? '',
      notes: row.notes ?? '',
    });
    this.editingId.set(row.id);
    this.formError.set('');
    this.editorOpen.set(true);
  }

  protected closeEditor(): void {
    this.editorOpen.set(false);
    this.editingId.set(null);
    this.formError.set('');
  }

  protected async submit(): Promise<void> {
    this.formError.set('');

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.formError.set('Customer name is required (at least 2 characters).');
      return;
    }

    const value = this.form.getRawValue();
    const payload = {
      type: value.type,
      name: value.name,
      email: value.email || undefined,
      phone: value.phone || undefined,
      address: value.address || undefined,
      taxId: value.taxId || undefined,
      notes: value.notes || undefined,
    };

    this.saving.set(true);

    try {
      const editingId = this.editingId();
      if (editingId) {
        await this.customersApi.update(editingId, payload);
      } else {
        await this.customersApi.create(payload);
      }

      this.closeEditor();
      await this.reload();
    } catch (error) {
      this.formError.set(apiErrorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(row: CustomerListRow): Promise<void> {
    this.actionError.set('');

    if (!confirm(`Archive ${row.name}? Their invoices stay in My invoices.`)) {
      return;
    }

    try {
      await this.customersApi.archive(row.id);
      await this.reload();
    } catch (error) {
      this.actionError.set(apiErrorMessage(error));
    }
  }

  protected typeLabel(type: CustomerType): string {
    return type === 'BUSINESS' ? 'Company' : 'Individual';
  }

  private async reload(): Promise<void> {
    this.loading.set(true);
    this.listError.set('');

    try {
      const result = await this.customersApi.list(this.search());
      this.rows.set(result.items);
      this.summary.set(result.summary);
    } catch (error) {
      this.listError.set(apiErrorMessage(error));
      this.rows.set([]);
    } finally {
      this.loading.set(false);
    }
  }
}
