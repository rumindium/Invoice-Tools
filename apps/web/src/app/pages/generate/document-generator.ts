import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CatalogItemService, ItemListRow } from '../../core/catalog-item.service';
import { CompanyService } from '../../core/company.service';
import { CustomerContact, CustomerListRow, CustomerService } from '../../core/customer.service';
import { formatIdr } from '../../core/format';
import { apiErrorMessage } from '../../core/http-error';
import { InvoicePayload, InvoiceService } from '../../core/invoice.service';
import { DocumentTemplate, TemplateService } from '../../core/template.service';
import { CurrencyInputDirective } from '../../ui/currency-input';
import { TemplateSummary } from '../../ui/template-summary';
import { TerminDraft, TerminService, formatPercentage } from '../../core/termin.service';
import { SINGLE_DRAFT, TerminPlanner, terminDraftError } from '../../ui/termins/termin-planner';

function isoDate(offsetDays = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

@Component({
  selector: 'app-document-generator',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    CurrencyInputDirective,
    TemplateSummary,
    TerminPlanner,
  ],
  templateUrl: './document-generator.html',
  styleUrl: './document-generator.scss',
})
export class DocumentGeneratorPage {
  private readonly fb = inject(FormBuilder);
  private readonly invoicesApi = inject(InvoiceService);
  private readonly customersApi = inject(CustomerService);
  private readonly catalogApi = inject(CatalogItemService);
  private readonly companies = inject(CompanyService);
  private readonly templatesApi = inject(TemplateService);
  private readonly terminsApi = inject(TerminService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected config = {
    title: 'Create invoice',
    description: 'A bill for agreed work or products.',
    number: '',
    dateLabel: 'Invoice date',
    dueLabel: 'Due date',
    submitLabel: 'Save invoice',
  };

  protected readonly editingId = signal<string | null>(null);
  /** Revising an issued invoice: saving creates the next version. */
  protected readonly revising = signal(false);
  /** The template this invoice is generated with. */
  protected readonly template = signal<DocumentTemplate | null>(null);
  protected readonly nextRevision = signal(2);
  protected readonly saving = signal(false);
  protected readonly saveError = signal('');
  protected readonly companyMissing = signal(false);
  protected readonly totals = signal({ subtotal: 0, tax: 0, total: 0 });
  protected readonly customers = signal<CustomerListRow[]>([]);
  protected readonly contacts = signal<CustomerContact[]>([]);
  protected readonly selectedContact = signal<CustomerContact | null>(null);
  protected readonly catalogItems = signal<ItemListRow[]>([]);
  protected readonly formatIdr = formatIdr;
  protected readonly formatPercentage = formatPercentage;
  /** New invoices only: one invoice, or payment termins (one invoice per termin). */
  protected readonly termins = signal<TerminDraft>(SINGLE_DRAFT);
  protected readonly terminError = computed(() => terminDraftError(this.termins()));
  protected readonly terminsTotal = computed(() =>
    this.termins().percentages.reduce((total, value) => total + value, 0),
  );
  protected readonly submitLabel = computed(() => {
    const draft = this.termins();
    if (this.editingId() || !draft.split) return this.config.submitLabel;
    const withShare = draft.percentages.filter((value) => value > 0).length;
    return draft.generate === 'ALL'
      ? `Save ${withShare} termin invoices`
      : `Save termin ${draft.percentages.findIndex((value) => value > 0) + 1} invoice`;
  });

  protected readonly form = this.fb.nonNullable.group({
    documentNumber: [''],
    issueDate: [isoDate(), Validators.required],
    dueDate: [isoDate(14)],
    customerId: [''],
    contactId: [''],
    customerName: ['', Validators.required],
    customerEmail: [''],
    customerPhone: [''],
    customerAddress: [''],
    items: this.fb.array([this.createItem('', 1, 0, 11)]),
    notes: ['Payment by bank transfer to the account shown on the invoice.'],
    revisionReason: [''],
  });

  protected get items(): FormArray {
    return this.form.controls.items;
  }

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.recalculate());
    this.recalculate();
    void this.initialise();
  }

  protected customerLabel(customer: CustomerListRow): string {
    return customer.email ? `${customer.name} · ${customer.email}` : customer.name;
  }

  protected contactLabel(contact: CustomerContact): string {
    const details = [contact.jobTitle, contact.phone].filter(Boolean).join(' · ');
    return details ? `${contact.name} — ${details}` : contact.name;
  }

  protected itemLabel(item: ItemListRow): string {
    return `${item.name} · ${formatIdr(item.unitPrice)}`;
  }

  protected async onCustomerChange(event: Event): Promise<void> {
    const customerId = (event.target as HTMLSelectElement).value;

    this.form.controls.customerId.setValue(customerId);
    this.form.controls.contactId.setValue('');
    this.contacts.set([]);
    this.selectedContact.set(null);

    if (!customerId) {
      return;
    }

    const customer = this.customers().find((row) => row.id === customerId);

    if (customer) {
      this.form.patchValue({
        customerName: customer.name,
        customerEmail: customer.email ?? '',
        customerPhone: customer.phone ?? '',
        customerAddress: customer.address ?? '',
      });
    }

    await this.loadContacts(customerId);
  }

  protected onContactChange(event: Event): void {
    const contactId = (event.target as HTMLSelectElement).value;
    const contact = this.contacts().find((row) => row.id === contactId) ?? null;

    this.form.controls.contactId.setValue(contactId);
    this.selectedContact.set(contact);
  }

  protected addFromCatalog(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const catalogItemId = select.value;
    select.value = '';

    const item = this.catalogItems().find((row) => row.id === catalogItemId);

    if (!item) {
      return;
    }

    const first = this.items.at(0);

    if (this.items.length === 1 && !String(first.getRawValue().description).trim()) {
      first.patchValue({
        catalogItemId: item.id,
        description: item.name,
        quantity: 1,
        unitPrice: item.unitPrice,
      });
    } else {
      this.items.push(this.createItem(item.name, 1, item.unitPrice, 11, item.id));
    }

    this.recalculate();
  }

  protected addItem(): void {
    this.items.push(this.createItem());
    this.recalculate();
  }

  protected removeItem(index: number): void {
    if (this.items.length > 1) {
      this.items.removeAt(index);
      this.recalculate();
    }
  }

  protected lineTotal(index: number): number {
    const item = this.items.at(index).getRawValue() as {
      quantity: number;
      unitPrice: number;
      taxRate: number;
    };
    return Number(item.quantity) * Number(item.unitPrice) * (1 + Number(item.taxRate) / 100);
  }

  protected async submit(): Promise<void> {
    this.saveError.set('');

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.saveError.set('Complete the customer name and every item.');
      return;
    }

    const value = this.form.getRawValue();
    const termins = this.editingId() ? SINGLE_DRAFT : this.termins();
    const terminError = terminDraftError(termins);

    if (terminError) {
      this.saveError.set(terminError);
      return;
    }

    if (this.revising() && value.revisionReason.trim().length < 3) {
      this.form.controls.revisionReason.markAsTouched();
      this.saveError.set('Describe what was wrong before saving the new version.');
      return;
    }

    const payload: InvoicePayload = {
      customer: {
        id: value.customerId || undefined,
        contactId: value.contactId || undefined,
        name: value.customerName,
        email: value.customerEmail || undefined,
        address: value.customerAddress || undefined,
        phone: value.customerPhone || undefined,
      },
      issueDate: value.issueDate,
      dueDate: value.dueDate || undefined,
      referenceNumber: this.referenceNumber ?? undefined,
      notes: value.notes || undefined,
      items: value.items.map((item) => ({
        catalogItemId: item.catalogItemId || undefined,
        name: item.description,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        taxRate: Number(item.taxRate),
      })),
    };

    this.saving.set(true);

    try {
      const editingId = this.editingId();

      if (!editingId && termins.split) {
        const result = await this.terminsApi.forInvoice(payload, termins);
        await this.invoicesApi.loadSummary();
        await this.router.navigate(['/documents', result.documents[0]?.id ?? '']);
        return;
      }

      const invoice = !editingId
        ? await this.invoicesApi.create(payload)
        : this.revising()
          ? await this.invoicesApi.revise(editingId, {
              ...payload,
              terms: this.terms ?? undefined,
              reason: value.revisionReason.trim(),
            })
          : await this.invoicesApi.update(editingId, {
              ...payload,
              terms: this.terms ?? undefined,
            });

      await this.router.navigate(['/documents', invoice.id]);
    } catch (error) {
      this.saveError.set(apiErrorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  /** Fields the form does not show but an edit must keep (set when loading an invoice). */
  private terms: string | null = null;
  private referenceNumber: string | null = null;

  private async initialise(): Promise<void> {
    await Promise.all([this.loadMasterData(), this.loadCompany(), this.loadTemplate()]);

    const id = this.route.snapshot.queryParamMap.get('id');
    if (id) {
      await this.loadForEdit(id);
    }
  }

  private async loadMasterData(): Promise<void> {
    try {
      const [customers, items] = await Promise.all([
        this.customersApi.list(),
        this.catalogApi.list(),
      ]);

      this.customers.set(customers.items);
      this.catalogItems.set(items.items.filter((item) => item.isActive));
    } catch {
      // Typing a customer and custom lines still works when master data cannot be loaded.
    }
  }

  private async loadCompany(): Promise<void> {
    const company = await this.companies.ensureLoaded();
    this.companyMissing.set(!company);
  }

  private async loadTemplate(): Promise<void> {
    try {
      const { active } = await this.templatesApi.settings('invoice');
      // An issued invoice being revised keeps its own template (set in loadForEdit).
      if (!this.template()?.locked) {
        this.template.set({
          key: active.key,
          name: active.name,
          accentColor: active.accentColor,
          locked: false,
        });
      }
    } catch {
      this.template.set(null);
    }
  }

  private async loadContacts(customerId: string): Promise<void> {
    try {
      this.contacts.set(await this.customersApi.contacts(customerId));
    } catch {
      this.contacts.set([]);
    }
  }

  private async loadForEdit(id: string): Promise<void> {
    try {
      const invoice = await this.invoicesApi.get(id);

      this.editingId.set(invoice.id);
      this.terms = invoice.terms;
      if (invoice.template.locked) {
        this.template.set(invoice.template);
      }
      this.referenceNumber = invoice.referenceNumber;
      const revising =
        this.route.snapshot.queryParamMap.get('revise') === '1' && invoice.status !== 'DRAFT';
      this.revising.set(revising);
      this.nextRevision.set(invoice.revision + 1);
      this.config = {
        ...this.config,
        title: revising ? 'Revise invoice' : 'Edit invoice',
        description: revising
          ? `Correct version ${invoice.revision}. Saving creates version ${invoice.revision + 1}; the current one stays under Older versions.`
          : 'Update this draft before you issue it.',
        number: invoice.number ?? '',
        submitLabel: revising ? `Save as version ${invoice.revision + 1}` : 'Save changes',
      };

      const knownCustomer = this.customers().find((row) => row.id === invoice.customer.id);
      const contactId = invoice.customer.contact?.id ?? '';

      this.form.patchValue({
        documentNumber: invoice.number ?? '',
        issueDate: invoice.issueDate,
        dueDate: invoice.dueDate ?? '',
        customerId: knownCustomer?.id ?? '',
        contactId,
        customerName: invoice.customer.name,
        customerEmail: invoice.customer.email ?? '',
        customerPhone: invoice.customer.phone ?? '',
        customerAddress: invoice.customer.address ?? '',
        notes: invoice.notes ?? '',
      });

      if (knownCustomer) {
        await this.loadContacts(knownCustomer.id);
        this.selectedContact.set(
          this.contacts().find((contact) => contact.id === contactId) ?? null,
        );
      }

      this.items.clear();

      for (const item of invoice.items) {
        this.items.push(
          this.createItem(
            item.name,
            item.quantity,
            item.unitPrice,
            item.taxRate,
            item.catalogItemId ?? '',
          ),
        );
      }

      if (this.items.length === 0) {
        this.items.push(this.createItem());
      }

      this.recalculate();
    } catch (error) {
      this.saveError.set(apiErrorMessage(error));
    }
  }

  private createItem(
    description = '',
    quantity = 1,
    unitPrice = 0,
    taxRate = 11,
    catalogItemId = '',
  ) {
    return this.fb.nonNullable.group({
      catalogItemId: [catalogItemId],
      description: [description, Validators.required],
      quantity: [quantity, [Validators.required, Validators.min(0.01)]],
      unitPrice: [unitPrice, [Validators.required, Validators.min(0)]],
      taxRate: [taxRate, [Validators.min(0), Validators.max(100)]],
    });
  }

  private recalculate(): void {
    const value = this.form.getRawValue();

    let subtotal = 0;
    let tax = 0;

    for (const item of value.items) {
      const line = Number(item.quantity) * Number(item.unitPrice);
      subtotal += line;
      tax += line * (Number(item.taxRate) / 100);
    }

    this.totals.set({ subtotal, tax, total: subtotal + tax });
  }
}
