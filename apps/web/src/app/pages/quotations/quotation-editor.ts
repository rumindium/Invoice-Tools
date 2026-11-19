import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CatalogItemService, ItemListRow } from '../../core/catalog-item.service';
import { CompanyService } from '../../core/company.service';
import { CustomerContact, CustomerListRow, CustomerService } from '../../core/customer.service';
import { formatIdr } from '../../core/format';
import { apiErrorMessage } from '../../core/http-error';
import { QuotationPayload, QuotationService } from '../../core/quotation.service';
import { DocumentTemplate, TemplateService } from '../../core/template.service';
import { UnitOption, UnitService } from '../../core/unit.service';
import { CurrencyInputDirective } from '../../ui/currency-input';
import { SignaturePad } from '../../ui/signature-pad';
import { TemplateSummary } from '../../ui/template-summary';

function isoDate(offsetDays = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

const DEFAULT_TERMS = 'Prices are valid until the date above. Work starts after written approval.';

@Component({
  selector: 'app-quotation-editor',
  imports: [ReactiveFormsModule, RouterLink, CurrencyInputDirective, SignaturePad, TemplateSummary],
  templateUrl: './quotation-editor.html',
  styleUrls: ['../generate/document-generator.scss', './quotation-editor.scss'],
})
export class QuotationEditorPage {
  private readonly fb = inject(FormBuilder);
  private readonly quotationsApi = inject(QuotationService);
  private readonly customersApi = inject(CustomerService);
  private readonly catalogApi = inject(CatalogItemService);
  private readonly unitsApi = inject(UnitService);
  private readonly companies = inject(CompanyService);
  private readonly templatesApi = inject(TemplateService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly editingId = signal<string | null>(null);
  /** Revising a sent or accepted quotation: saving creates the next version. */
  protected readonly revising = signal(false);
  protected readonly nextRevision = signal(2);
  protected readonly title = signal('Create quotation');
  protected readonly subtitle = signal(
    'A priced offer your customer can accept before you invoice.',
  );
  protected readonly number = signal('');
  protected readonly saving = signal(false);
  protected readonly saveError = signal('');
  protected readonly companyMissing = signal(false);
  protected readonly totals = signal({ subtotal: 0, tax: 0, total: 0 });
  protected readonly customers = signal<CustomerListRow[]>([]);
  protected readonly contacts = signal<CustomerContact[]>([]);
  protected readonly catalogItems = signal<ItemListRow[]>([]);
  protected readonly units = signal<UnitOption[]>([]);
  protected readonly formatIdr = formatIdr;
  /** The template this quotation will be generated with. */
  protected readonly template = signal<DocumentTemplate | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    issueDate: [isoDate(), Validators.required],
    validUntil: [isoDate(30), Validators.required],
    referenceNumber: [''],
    customerId: [''],
    contactId: [''],
    recipientName: ['', [Validators.required, Validators.minLength(2)]],
    recipientEmail: ['', Validators.email],
    recipientPhone: [''],
    recipientAddress: [''],
    attentionName: [''],
    attentionTitle: [''],
    items: this.fb.array([this.createItem()]),
    notes: [''],
    terms: [DEFAULT_TERMS],
    signatureName: [''],
    signatureTitle: [''],
    signatureImage: [''],
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

    if (!customerId) {
      return;
    }

    const customer = this.customers().find((row) => row.id === customerId);

    if (customer) {
      this.form.patchValue({
        recipientName: customer.name,
        recipientEmail: customer.email ?? '',
        recipientPhone: customer.phone ?? '',
        recipientAddress: customer.address ?? '',
      });
    }

    await this.loadContacts(customerId);
  }

  /** A saved PIC fills the attention line; "type a name" clears it for manual entry. */
  protected onContactChange(event: Event): void {
    const contactId = (event.target as HTMLSelectElement).value;
    const contact = this.contacts().find((row) => row.id === contactId);

    this.form.patchValue({
      contactId,
      attentionName: contact?.name ?? '',
      attentionTitle: contact?.jobTitle ?? '',
    });
  }

  protected addFromCatalog(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const item = this.catalogItems().find((row) => row.id === select.value);
    select.value = '';

    if (!item) {
      return;
    }

    const first = this.items.at(0);
    const line = {
      catalogItemId: item.id,
      description: item.name,
      unit: item.unit || 'unit',
      quantity: 1,
      unitPrice: item.unitPrice,
    };

    if (this.items.length === 1 && !String(first.getRawValue().description).trim()) {
      first.patchValue(line);
    } else {
      this.items.push(this.createItem(line));
    }
  }

  protected addItem(): void {
    this.items.push(this.createItem());
  }

  protected removeItem(index: number): void {
    if (this.items.length > 1) {
      this.items.removeAt(index);
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
      this.saveError.set('Complete the recipient, the dates and every item.');
      return;
    }

    const value = this.form.getRawValue();

    if (this.revising() && value.revisionReason.trim().length < 3) {
      this.form.controls.revisionReason.markAsTouched();
      this.saveError.set('Describe what was wrong before saving the new version.');
      return;
    }

    if (value.validUntil < value.issueDate) {
      this.saveError.set('Valid until cannot be earlier than the quotation date.');
      return;
    }

    const payload: QuotationPayload = {
      recipient: {
        id: value.customerId || undefined,
        contactId: value.contactId || undefined,
        name: value.recipientName.trim(),
        email: value.recipientEmail.trim() || undefined,
        address: value.recipientAddress.trim() || undefined,
        phone: value.recipientPhone.trim() || undefined,
        attentionName: value.contactId ? undefined : value.attentionName.trim() || undefined,
        attentionTitle: value.contactId ? undefined : value.attentionTitle.trim() || undefined,
      },
      issueDate: value.issueDate,
      validUntil: value.validUntil,
      referenceNumber: value.referenceNumber.trim() || undefined,
      notes: value.notes.trim() || undefined,
      terms: value.terms.trim() || undefined,
      items: value.items.map((item) => ({
        catalogItemId: item.catalogItemId || undefined,
        name: item.description.trim(),
        unit: item.unit.trim() || undefined,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        taxRate: Number(item.taxRate),
      })),
      signature: {
        name: value.signatureName.trim() || undefined,
        title: value.signatureTitle.trim() || undefined,
        imageDataUrl: value.signatureImage || undefined,
      },
    };

    this.saving.set(true);

    try {
      const editingId = this.editingId();
      const quotation = !editingId
        ? await this.quotationsApi.create(payload)
        : this.revising()
          ? await this.quotationsApi.revise(editingId, {
              ...payload,
              reason: value.revisionReason.trim(),
            })
          : await this.quotationsApi.update(editingId, payload);

      await this.router.navigate(['/quotations', quotation.id]);
    } catch (error) {
      this.saveError.set(apiErrorMessage(error).replace(/\bsignature\./g, ''));
    } finally {
      this.saving.set(false);
    }
  }

  private async initialise(): Promise<void> {
    await Promise.all([this.loadMasterData(), this.loadCompany(), this.loadTemplate()]);

    const id = this.route.snapshot.queryParamMap.get('id');
    if (id) {
      await this.loadForEdit(id);
    }
  }

  private async loadMasterData(): Promise<void> {
    const [customers, items, units] = await Promise.allSettled([
      this.customersApi.list(),
      this.catalogApi.list(),
      this.unitsApi.list(),
    ]);

    // Typing a recipient and custom lines still works when master data cannot be loaded.
    if (customers.status === 'fulfilled') this.customers.set(customers.value.items);
    if (items.status === 'fulfilled') {
      this.catalogItems.set(items.value.items.filter((item) => item.isActive));
    }
    if (units.status === 'fulfilled') this.units.set(units.value);
  }

  private async loadCompany(): Promise<void> {
    const company = await this.companies.ensureLoaded();
    this.companyMissing.set(!company);

    if (company && !this.editingId()) {
      this.form.patchValue({
        signatureName: company.signatoryName ?? '',
        signatureTitle: company.signatoryTitle ?? '',
      });
    }
  }

  private async loadTemplate(): Promise<void> {
    try {
      const { active } = await this.templatesApi.settings('quotation');
      // A sent quotation being revised keeps its own template (set in loadForEdit).
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
      const quotation = await this.quotationsApi.get(id);

      this.editingId.set(quotation.id);
      const revising =
        this.route.snapshot.queryParamMap.get('revise') === '1' && quotation.status !== 'DRAFT';
      this.revising.set(revising);
      this.nextRevision.set(quotation.revision + 1);
      this.title.set(revising ? 'Revise quotation' : 'Edit quotation');
      this.subtitle.set(
        revising
          ? `Correct version ${quotation.revision}. Saving creates version ${quotation.revision + 1}; the current one stays under Older versions.`
          : 'Update this draft before you send it.',
      );
      this.number.set(quotation.number ?? '');
      if (quotation.template.locked) {
        this.template.set(quotation.template);
      }

      const knownCustomer = this.customers().find((row) => row.id === quotation.recipient.id);
      const attention = quotation.recipient.attention;

      if (knownCustomer) {
        await this.loadContacts(knownCustomer.id);
      }

      const savedContact = attention?.id
        ? this.contacts().find((contact) => contact.id === attention.id)
        : undefined;

      this.form.patchValue({
        issueDate: quotation.issueDate,
        validUntil: quotation.validUntil ?? '',
        referenceNumber: quotation.referenceNumber ?? '',
        customerId: knownCustomer?.id ?? '',
        contactId: savedContact?.id ?? '',
        recipientName: quotation.recipient.name,
        recipientEmail: quotation.recipient.email ?? '',
        recipientPhone: quotation.recipient.phone ?? '',
        recipientAddress: quotation.recipient.address ?? '',
        attentionName: attention?.name ?? '',
        attentionTitle: attention?.jobTitle ?? '',
        notes: quotation.notes ?? '',
        terms: quotation.terms ?? '',
        signatureName: quotation.signature.name ?? '',
        signatureTitle: quotation.signature.title ?? '',
        signatureImage: quotation.signature.imageDataUrl ?? '',
      });

      this.items.clear();
      for (const item of quotation.items) {
        this.items.push(
          this.createItem({
            catalogItemId: item.catalogItemId ?? '',
            description: item.name,
            unit: item.unit,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            taxRate: item.taxRate,
          }),
        );
      }

      if (this.items.length === 0) {
        this.items.push(this.createItem());
      }
    } catch (error) {
      this.saveError.set(apiErrorMessage(error));
    }
  }

  private createItem(
    line: Partial<{
      catalogItemId: string;
      description: string;
      unit: string;
      quantity: number;
      unitPrice: number;
      taxRate: number;
    }> = {},
  ) {
    return this.fb.nonNullable.group({
      catalogItemId: [line.catalogItemId ?? ''],
      description: [line.description ?? '', Validators.required],
      unit: [line.unit ?? 'unit'],
      quantity: [line.quantity ?? 1, [Validators.required, Validators.min(0.01)]],
      unitPrice: [line.unitPrice ?? 0, [Validators.required, Validators.min(0)]],
      taxRate: [line.taxRate ?? 11, [Validators.min(0), Validators.max(100)]],
    });
  }

  private recalculate(): void {
    let subtotal = 0;
    let tax = 0;

    for (const item of this.form.getRawValue().items) {
      const line = Number(item.quantity) * Number(item.unitPrice);
      subtotal += line;
      tax += line * (Number(item.taxRate) / 100);
    }

    this.totals.set({ subtotal, tax, total: subtotal + tax });
  }
}
