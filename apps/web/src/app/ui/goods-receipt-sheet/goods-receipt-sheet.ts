import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatDate } from '../../core/format';
import {
  GOODS_RECEIPT_STATUS_LABEL,
  GoodsReceipt,
  GoodsReceiptStatus,
  formatQuantity,
  goodsReceiptStatusClass,
} from '../../core/goods-receipt.service';
import { DocumentDesign, TemplateKey } from '../../core/template.service';
import { DesignSheet } from '../../pages/template-builder/design-sheet';
import {
  documentStamp,
  goodsReceiptDesignContext,
} from '../../pages/template-builder/document-context';
import { themeStyle } from '../../core/template-theme';
import { terminLabel } from '../../core/termin.service';

export type GoodsReceiptSheetData = Pick<
  GoodsReceipt,
  | 'number'
  | 'revision'
  | 'status'
  | 'receiptDate'
  | 'source'
  | 'details'
  | 'recipient'
  | 'company'
  | 'lines'
  | 'totals'
  | 'notes'
  | 'cancelReason'
> &
  Partial<Pick<GoodsReceipt, 'termin'>>;

interface ReferenceCell {
  label: string;
  value: string;
  /** Router link for the quotation number. */
  link?: unknown[];
}

const LAYOUTS: TemplateKey[] = ['classic', 'modern', 'minimal', 'elegant', 'bold'];

export const INSPECTION_STATEMENT =
  'We confirm that the goods listed above were received and inspected. Accepted quantities were ' +
  'received in good condition; rejected quantities and their reasons are noted in Remarks.';

/**
 * A goods receipt note drawn on an A4 portrait sheet in one of the five template layouts and
 * the company's accent colour. It mirrors the PDF renderer (apps/api/src/goods-receipts/pdf).
 */
@Component({
  selector: 'app-goods-receipt-sheet',
  imports: [NgTemplateOutlet, RouterLink, DesignSheet],
  templateUrl: './goods-receipt-sheet.html',
  styleUrls: ['./goods-receipt-sheet.scss', './goods-receipt-sheet-layouts.scss'],
})
export class GoodsReceiptSheet {
  readonly receipt = input.required<GoodsReceiptSheetData>();
  readonly templateKey = input<string>('classic');
  readonly accentColor = input<string>('#2563eb');
  /** A template-builder design: drawn instead of the built-in layout. */
  readonly design = input<DocumentDesign | null | undefined>(null);

  protected readonly designContext = computed(() => goodsReceiptDesignContext(this.receipt()));
  protected readonly designStamp = computed(() => {
    const receipt = this.receipt();
    return documentStamp(
      receipt.status,
      (receipt as { supersededRevision?: { revision: number } }).supersededRevision?.revision,
    );
  });
  readonly testId = input('goods-receipt-sheet');
  /** Link the quotation number to the quotation (off for samples). */
  readonly linkSource = input(true);

  protected readonly formatQuantity = formatQuantity;
  protected readonly inspection = INSPECTION_STATEMENT;

  protected readonly layout = computed<TemplateKey>(() => {
    const key = this.templateKey() as TemplateKey;
    return LAYOUTS.includes(key) ? key : 'classic';
  });

  protected readonly themeStyle = computed(() => themeStyle(this.accentColor()));
  protected readonly accent = computed(() => this.themeStyle()['--t-accent']);

  protected readonly statusLabel = computed(
    () => GOODS_RECEIPT_STATUS_LABEL[this.receipt().status as GoodsReceiptStatus],
  );
  protected readonly statusClass = computed(() => goodsReceiptStatusClass(this.receipt().status));

  protected readonly number = computed(() => {
    const r = this.receipt();
    return `${r.number ?? 'Draft'}${r.revision > 1 ? ` · Rev. ${r.revision}` : ''}`;
  });

  protected readonly companyLines = computed(() => {
    const company = this.receipt().company;
    return [
      company.address,
      [company.phone, company.email].filter(Boolean).join(' · ') || null,
      company.taxId ? `Tax ID ${company.taxId}` : null,
    ].filter((line): line is string => Boolean(line));
  });

  protected readonly supplierLines = computed(() => {
    const company = this.receipt().company;
    return [
      company.address,
      [company.phone, company.email].filter(Boolean).join(' · ') || null,
    ].filter((line): line is string => Boolean(line));
  });

  protected readonly customerLines = computed(() => {
    const recipient = this.receipt().recipient;
    const attention = recipient.attention;
    return [
      attention
        ? `Attn. ${attention.name}${attention.jobTitle ? ` · ${attention.jobTitle}` : ''}`
        : null,
      recipient.address,
      [recipient.phone, recipient.email].filter(Boolean).join(' · ') || null,
    ].filter((line): line is string => Boolean(line));
  });

  /** GRN, dates, quotation, PO, delivery note, carrier, vehicle (the PDF's reading order). */
  protected readonly references = computed<ReferenceCell[]>(() => {
    const r = this.receipt();
    return [
      { label: 'GRN No.', value: r.number ?? 'Draft' },
      { label: 'Receipt date', value: formatDate(r.receiptDate) },
      {
        label: 'Quotation No.',
        value: r.source.quotationNumber ?? '—',
        link: this.linkSource() ? ['/quotations', r.source.quotationId] : undefined,
      },
      { label: 'Quotation date', value: formatDate(r.source.quotationDate || null) },
      { label: 'Customer PO / Ref.', value: r.source.customerReference || '—' },
      { label: 'Delivery note No.', value: r.details.deliveryNoteNumber || '—' },
      { label: 'Carrier', value: r.details.carrier || '—' },
      { label: 'Vehicle No.', value: r.details.vehicleNumber || '—' },
      // Termin receipts: "1 of 3 · 30%".
      ...(r.termin
        ? [{ label: 'Termin', value: terminLabel(r.termin).replace(/^Termin /, '') }]
        : []),
    ];
  });

  /** After a ninth (termin) cell the receiving location takes the rest of its row. */
  protected readonly locationRest = computed(() => this.references().length % 4 !== 0);

  protected readonly location = computed(() => this.receipt().details.receivingLocation || '—');

  /** Bold keeps the first five references in its sidebar and the rest in the main column. */
  protected readonly sideReferences = computed(() => this.references().slice(0, 5));
  protected readonly stripReferences = computed(() => this.references().slice(5));

  protected readonly signOff = computed(() => {
    const r = this.receipt();
    return [
      { label: 'Delivered by', name: r.details.deliveredByName, caption: r.company.name },
      { label: 'Checked by', name: r.details.checkedByName, caption: '\u00a0' },
      {
        label: 'Received by',
        name: r.details.receivedByName,
        caption: r.details.receivedByTitle || r.recipient.name,
      },
    ];
  });
}
