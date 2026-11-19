import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { CompanyService } from '../../core/company.service';
import { formatDate } from '../../core/format';
import { apiErrorMessage } from '../../core/http-error';
import {
  TemplateDocumentType,
  TemplateKey,
  TemplateOption,
  TemplateService,
  TemplateSettings,
} from '../../core/template.service';
import { isHexColor } from '../../core/template-theme';
import { GoodsReceiptSheet } from '../../ui/goods-receipt-sheet/goods-receipt-sheet';
import { InvoiceSheet } from '../../ui/invoice-sheet/invoice-sheet';
import { QuotationSheet } from '../../ui/quotation-sheet/quotation-sheet';
import { CustomDesigns } from './custom-designs';
import { sampleGoodsReceipt, sampleInvoice, sampleQuotation } from './samples';

interface DocumentCopy {
  eyebrow: string;
  heading: string;
  intro: string;
  /** "quotation", "goods receipt": used in sentences. */
  singular: string;
  plural: string;
  createLink: string;
  createLabel: string;
  rules: Array<{ strong: string; text: string }>;
}

const COPY: Record<TemplateDocumentType, DocumentCopy> = {
  quotation: {
    eyebrow: 'Templates',
    heading: 'Quotation templates',
    intro:
      'Choose the design of your quotations and colour it in your brand. The applied template is used automatically for every new quotation, every draft and their PDFs.',
    singular: 'quotation',
    plural: 'quotations',
    createLink: '/quotations/new',
    createLabel: 'Create a quotation',
    rules: [
      { strong: 'New quotations', text: 'are generated with the applied template.' },
      { strong: 'Drafts', text: 'follow the applied template until they are sent.' },
      {
        strong: 'Sent quotations',
        text: "keep the design they were sent with, so your customer's copy never changes.",
      },
    ],
  },
  'goods-receipt': {
    eyebrow: 'Templates',
    heading: 'Goods receipt templates',
    intro:
      'Choose the design of your goods receipt notes and colour it in your brand. The applied template is used automatically for every goods receipt generated from an accepted quotation, every draft and their PDFs.',
    singular: 'goods receipt',
    plural: 'goods receipts',
    createLink: '/goods-receipts/new',
    createLabel: 'Create a goods receipt',
    rules: [
      {
        strong: 'New goods receipts',
        text: 'created from an accepted quotation are generated with the applied template.',
      },
      { strong: 'Drafts', text: 'follow the applied template until they are posted.' },
      {
        strong: 'Received or cancelled receipts',
        text: 'keep the design they were posted with, so signed copies never change.',
      },
      {
        strong: 'Independent of quotations',
        text: 'your quotation template and colour are chosen separately.',
      },
    ],
  },
  invoice: {
    eyebrow: 'Templates',
    heading: 'Invoice templates',
    intro:
      'Choose the design of your invoices and colour it in your brand. The applied template is used automatically for every new invoice — written by hand or generated from a goods receipt — every draft and their PDFs.',
    singular: 'invoice',
    plural: 'invoices',
    createLink: '/invoices/new',
    createLabel: 'Create an invoice',
    rules: [
      {
        strong: 'New invoices',
        text: 'created by hand or generated from a received goods receipt use the applied template.',
      },
      { strong: 'Drafts', text: 'follow the applied template until they are issued.' },
      {
        strong: 'Issued, paid or void invoices',
        text: "keep the design they were issued with, so your customer's copy never changes.",
      },
      {
        strong: 'Independent of other documents',
        text: 'quotation and goods receipt templates are chosen separately.',
      },
    ],
  },
};

/**
 * Document templates for one document type (route data `documentType`): pick one of five
 * layouts, recolour it, and apply it. The applied template is used automatically for every
 * new document of that type, every draft and their PDFs.
 */
@Component({
  selector: 'app-document-templates',
  imports: [RouterLink, QuotationSheet, GoodsReceiptSheet, InvoiceSheet, CustomDesigns],
  templateUrl: './document-templates.html',
  styleUrl: './document-templates.scss',
})
export class DocumentTemplatesPage {
  private readonly route = inject(ActivatedRoute);
  private readonly templatesApi = inject(TemplateService);
  private readonly companies = inject(CompanyService);

  protected readonly documentType = toSignal(
    this.route.data.pipe(
      map((data) => (data['documentType'] as TemplateDocumentType | undefined) ?? 'quotation'),
    ),
    { initialValue: 'quotation' as TemplateDocumentType },
  );
  protected readonly copy = computed(() => COPY[this.documentType()]);

  protected readonly settings = signal<TemplateSettings | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly actionError = signal('');
  protected readonly notice = signal('');
  protected readonly saving = signal(false);
  protected readonly previewing = signal(false);
  protected readonly companyMissing = signal(false);

  /** The layout being looked at (not necessarily applied yet). */
  protected readonly selectedKey = signal<TemplateKey>('classic');
  /** Colour per layout as edited on this page; starts from the company's saved colours. */
  protected readonly colors = signal<Record<string, string>>({});
  protected readonly hexDraft = signal('');

  protected readonly formatDate = formatDate;

  protected readonly templates = computed(() => this.settings()?.templates ?? []);
  protected readonly palette = computed(() => this.settings()?.palette ?? []);
  protected readonly active = computed(() => this.settings()?.active ?? null);

  protected readonly selected = computed(
    () => this.templates().find((template) => template.key === this.selectedKey()) ?? null,
  );
  protected readonly selectedColor = computed(
    () => this.colors()[this.selectedKey()] ?? this.selected()?.defaultColor ?? '#2563eb',
  );

  /** Something differs from what documents currently use. */
  protected readonly dirty = computed(() => {
    const active = this.active();
    return (
      !!active && (active.key !== this.selectedKey() || active.accentColor !== this.selectedColor())
    );
  });

  protected readonly sampleQuotation = computed(() => sampleQuotation(this.companies.company()));
  protected readonly sampleReceipt = computed(() => sampleGoodsReceipt(this.companies.company()));
  protected readonly sampleInvoice = computed(() => sampleInvoice(this.companies.company()));

  constructor() {
    void this.load();
  }

  protected colorFor(template: TemplateOption): string {
    return this.colors()[template.key] ?? template.accentColor;
  }

  protected select(key: TemplateKey): void {
    this.selectedKey.set(key);
    this.hexDraft.set(this.selectedColor());
    this.notice.set('');
  }

  protected setColor(color: string): void {
    if (!isHexColor(color)) {
      return;
    }
    const normalised = color.toLowerCase();
    this.colors.update((colors) => ({ ...colors, [this.selectedKey()]: normalised }));
    this.hexDraft.set(normalised);
    this.notice.set('');
  }

  protected onPicker(event: Event): void {
    this.setColor((event.target as HTMLInputElement).value);
  }

  protected onHexInput(event: Event): void {
    let value = (event.target as HTMLInputElement).value.trim();
    if (value && !value.startsWith('#')) {
      value = `#${value}`;
    }
    this.hexDraft.set(value);
    this.setColor(value);
  }

  protected hexInvalid(): boolean {
    return this.hexDraft() !== '' && !isHexColor(this.hexDraft());
  }

  protected resetColor(): void {
    const selected = this.selected();
    if (selected) {
      this.setColor(selected.defaultColor);
    }
  }

  protected isSwatch(color: string): boolean {
    return this.selectedColor() === color.toLowerCase();
  }

  /** A builder design was applied from "Your designs". */
  protected designApplied(settings: TemplateSettings): void {
    this.settings.set(settings);
    const copy = this.copy();
    this.notice.set(
      `${settings.active.name} (Template Builder) is now your ${copy.singular} template. New ${copy.plural}, drafts and their PDFs use it automatically.`,
    );
  }

  protected async apply(): Promise<void> {
    const selected = this.selected();
    if (!selected || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.actionError.set('');

    try {
      const settings = await this.templatesApi.apply(
        this.documentType(),
        selected.key,
        this.selectedColor(),
      );
      this.settings.set(settings);
      const copy = this.copy();
      this.notice.set(
        `${settings.active.name} is now your ${copy.singular} template. New ${copy.plural}, drafts and their PDFs use it automatically.`,
      );
    } catch (error) {
      this.actionError.set(apiErrorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  protected async previewPdf(): Promise<void> {
    const selected = this.selected();
    if (!selected) {
      return;
    }
    // Open the tab inside the click so pop-up blockers allow it; fill it once the PDF is ready.
    const tab = window.open('', '_blank');
    this.previewing.set(true);
    this.actionError.set('');

    try {
      if (tab) {
        tab.location.href = await this.templatesApi.previewPdfHref(
          this.documentType(),
          selected.key,
          this.selectedColor(),
        );
      } else {
        // Pop-ups blocked: download the file instead.
        const url = await this.templatesApi.previewPdfUrl(
          this.documentType(),
          selected.key,
          this.selectedColor(),
        );
        const link = document.createElement('a');
        link.href = url;
        link.download = `${this.documentType()}-template-${selected.key}.pdf`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    } catch {
      tab?.close();
      this.actionError.set('The sample PDF could not be generated.');
    } finally {
      this.previewing.set(false);
    }
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set('');

    try {
      const [settings] = await Promise.all([
        this.templatesApi.settings(this.documentType()),
        this.companies.ensureLoaded(),
      ]);
      this.settings.set(settings);
      this.colors.set(
        Object.fromEntries(
          settings.templates.map((template) => [template.key, template.accentColor]),
        ),
      );
      // A builder design may be active; the gallery then starts on Classic.
      this.selectedKey.set(settings.active.key === 'custom' ? 'classic' : settings.active.key);
      this.hexDraft.set(settings.active.accentColor);
    } catch (error) {
      this.companyMissing.set(!this.companies.company());
      this.loadError.set(apiErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}
