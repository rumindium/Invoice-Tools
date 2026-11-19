import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { formatMoney } from '../../core/format';
import { TemplateKey } from '../../core/template.service';
import { themeStyle } from '../../core/template-theme';

/**
 * A priced sales document (quotation, invoice) as the sheet draws it. QuotationSheet and
 * InvoiceSheet map their documents onto this model, mirroring the API's priced PDF model
 * (apps/api/src/documents/pdf/priced), so screen and PDF share the five layouts.
 */
export interface PricedSheetData {
  /** "QUOTATION", "INVOICE". */
  title: string;
  /** "Quotation", "Invoice". */
  titleCase: string;
  number: string;
  statusLabel: string;
  /** Badge classes for the status (Classic). */
  statusClass: string;
  company: {
    name: string;
    address: string | null;
    email: string | null;
    phone: string | null;
    taxId: string | null;
    logoDataUrl: string | null;
  };
  party: {
    heading: string;
    preparedHeading: string;
    name: string;
    attention: string | null;
    lines: string[];
  };
  details: Array<{ label: string; value: string }>;
  currency: string;
  items: Array<{
    id: string;
    name: string;
    description: string | null;
    quantity: number;
    unit: string;
    unitPrice: number;
    taxRate: number;
    lineTotal: number;
  }>;
  totals: Array<{ label: string; value: string }>;
  grandTotal: string;
  /** Paid and balance due; the last row is emphasised. */
  settlement: Array<{ label: string; value: string }>;
  sections: Array<{ label: string; body: string | null; tone?: 'danger' }>;
  signature: {
    date: string;
    greeting: string;
    name: string;
    title: string;
    imageDataUrl: string | null;
    compact?: boolean;
  } | null;
}

const LAYOUTS: TemplateKey[] = ['classic', 'modern', 'minimal', 'elegant', 'bold'];

/** A priced document on an A4 portrait sheet in one of the five template layouts. */
@Component({
  selector: 'app-priced-sheet',
  imports: [NgTemplateOutlet],
  templateUrl: './priced-sheet.html',
  styleUrls: ['./priced-sheet.scss', './priced-sheet-layouts.scss'],
})
export class PricedSheet {
  readonly doc = input.required<PricedSheetData>();
  readonly templateKey = input<string>('classic');
  readonly accentColor = input<string>('#2563eb');
  /** data-testid of the sheet. */
  readonly testId = input.required<string>();
  /** Prefix of the inner test ids ("quotation" → quotation-status, quotation-sheet-item…). */
  readonly prefix = input.required<string>();

  protected readonly formatMoney = formatMoney;

  protected readonly layout = computed<TemplateKey>(() => {
    const key = this.templateKey() as TemplateKey;
    return LAYOUTS.includes(key) ? key : 'classic';
  });

  protected readonly themeStyle = computed(() => themeStyle(this.accentColor()));
  protected readonly accent = computed(() => this.themeStyle()['--t-accent']);

  protected readonly companyLines = computed(() => {
    const company = this.doc().company;
    return [
      company.address,
      [company.phone, company.email].filter(Boolean).join(' · ') || null,
      company.taxId ? `Tax ID ${company.taxId}` : null,
    ].filter((line): line is string => Boolean(line));
  });
}
