import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CustomerContact, CustomerListRow, CustomerService } from '../../core/customer.service';
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_LABEL,
  FEEDBACK_SOURCES,
  FEEDBACK_SOURCE_ICON,
  FEEDBACK_SOURCE_LABEL,
  FeedbackCategory,
  FeedbackPayload,
  FeedbackService,
  FeedbackSource,
  RELATED_TYPE_LABEL,
  RelatedDocument,
} from '../../core/feedback.service';
import { formatDate } from '../../core/format';
import { apiErrorMessage } from '../../core/http-error';
import { StarRating } from '../../ui/star-rating';

function today(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

@Component({
  selector: 'app-feedback-editor',
  imports: [ReactiveFormsModule, RouterLink, StarRating],
  templateUrl: './feedback-editor.html',
  styleUrls: ['../generate/document-generator.scss', './feedback-editor.scss'],
})
export class FeedbackEditorPage {
  private readonly fb = inject(FormBuilder);
  private readonly feedbackApi = inject(FeedbackService);
  private readonly customersApi = inject(CustomerService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly editingId = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly saveError = signal('');
  protected readonly customers = signal<CustomerListRow[]>([]);
  protected readonly contacts = signal<CustomerContact[]>([]);
  protected readonly documents = signal<RelatedDocument[]>([]);

  protected readonly sources = FEEDBACK_SOURCES;
  protected readonly categories = FEEDBACK_CATEGORIES;
  protected readonly sourceLabel = FEEDBACK_SOURCE_LABEL;
  protected readonly sourceIcon = FEEDBACK_SOURCE_ICON;
  protected readonly categoryLabel = FEEDBACK_CATEGORY_LABEL;
  protected readonly relatedTypeLabel = RELATED_TYPE_LABEL;
  protected readonly formatDate = formatDate;
  protected readonly maxDate = today();

  protected readonly form = this.fb.nonNullable.group({
    customerId: [''],
    customerName: ['', [Validators.required, Validators.minLength(2)]],
    contactName: [''],
    source: ['WHATSAPP' as FeedbackSource, Validators.required],
    sourceDetail: [''],
    receivedOn: [today(), Validators.required],
    evidence: [''],
    category: ['COMPLIMENT' as FeedbackCategory, Validators.required],
    rating: this.fb.control<number | null>(null),
    subject: ['', [Validators.required, Validators.minLength(3)]],
    message: ['', [Validators.required, Validators.minLength(3)]],
    relatedDocumentId: [''],
  });

  constructor() {
    void this.initialise();
  }

  protected customerLabel(customer: CustomerListRow): string {
    return customer.email ? `${customer.name} · ${customer.email}` : customer.name;
  }

  protected documentLabel(document: RelatedDocument): string {
    return `${this.relatedTypeLabel[document.type]} ${document.number ?? ''} · ${formatDate(document.date)}`;
  }

  protected documentScope(): string {
    return this.form.controls.customerId.value ? ' of this customer' : '';
  }

  protected chooseSource(source: FeedbackSource): void {
    this.form.controls.source.setValue(source);
    if (source !== 'OTHER') {
      this.form.controls.sourceDetail.setValue('');
    }
  }

  protected async onCustomerChange(event: Event): Promise<void> {
    const customerId = (event.target as HTMLSelectElement).value;
    const customer = this.customers().find((row) => row.id === customerId);

    this.form.patchValue({ customerId, relatedDocumentId: '' });
    if (customer) {
      this.form.controls.customerName.setValue(customer.name);
    }
    await Promise.all([this.loadContacts(customerId), this.loadDocuments(customerId)]);
  }

  protected chooseContact(event: Event): void {
    const name = (event.target as HTMLSelectElement).value;
    (event.target as HTMLSelectElement).value = '';
    if (name) {
      this.form.controls.contactName.setValue(name);
    }
  }

  protected async submit(): Promise<void> {
    this.saveError.set('');
    const value = this.form.getRawValue();

    if (value.source === 'OTHER' && !value.sourceDetail.trim()) {
      this.form.markAllAsTouched();
      this.saveError.set('Describe the channel when the source is "Other".');
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.saveError.set('Add the customer, the subject and what the customer said.');
      return;
    }

    const payload: FeedbackPayload = {
      customerId: value.customerId || undefined,
      customerName: value.customerName.trim(),
      contactName: value.contactName.trim() || undefined,
      source: value.source,
      sourceDetail: value.source === 'OTHER' ? value.sourceDetail.trim() : undefined,
      category: value.category,
      rating: value.rating ?? undefined,
      subject: value.subject.trim(),
      message: value.message.trim(),
      receivedOn: value.receivedOn,
      relatedDocumentId: value.relatedDocumentId || undefined,
      evidence: value.evidence.trim() || undefined,
    };

    this.saving.set(true);
    try {
      const editingId = this.editingId();
      const saved = editingId
        ? await this.feedbackApi.update(editingId, payload)
        : await this.feedbackApi.create(payload);
      await this.router.navigate(['/feedback', saved.id]);
    } catch (error) {
      this.saveError.set(apiErrorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  private async initialise(): Promise<void> {
    try {
      this.customers.set((await this.customersApi.list()).items);
    } catch {
      // A typed customer name still works without master data.
    }

    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      await this.loadDocuments('');
      return;
    }

    try {
      const feedback = await this.feedbackApi.get(id);
      this.editingId.set(feedback.id);
      this.form.patchValue({
        customerId: feedback.customer.id ?? '',
        customerName: feedback.customer.name,
        contactName: feedback.contactName ?? '',
        source: feedback.source,
        sourceDetail: feedback.sourceDetail ?? '',
        receivedOn: feedback.receivedOn,
        evidence: feedback.evidence ?? '',
        category: feedback.category,
        rating: feedback.rating,
        subject: feedback.subject,
        message: feedback.message,
      });
      await Promise.all([
        this.loadContacts(feedback.customer.id ?? ''),
        this.loadDocuments(feedback.customer.id ?? ''),
      ]);
      this.form.controls.relatedDocumentId.setValue(feedback.relatedDocument?.id ?? '');
    } catch (error) {
      this.saveError.set(apiErrorMessage(error));
    }
  }

  private async loadContacts(customerId: string): Promise<void> {
    if (!customerId) {
      this.contacts.set([]);
      return;
    }
    try {
      this.contacts.set(await this.customersApi.contacts(customerId));
    } catch {
      this.contacts.set([]);
    }
  }

  private async loadDocuments(customerId: string): Promise<void> {
    try {
      this.documents.set(await this.feedbackApi.relatedDocuments(customerId || undefined));
    } catch {
      this.documents.set([]);
    }
  }
}
