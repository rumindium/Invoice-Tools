import { Component, computed, input } from '@angular/core';
import { formatDate, formatMoney } from '../../core/format';
import {
  QUOTATION_STATUS_LABEL,
  Quotation,
  quotationDisplayStatus,
  quotationStatusClass,
} from '../../core/quotation.service';
import { PricedSheet, PricedSheetData } from '../priced-sheet/priced-sheet';
import { DocumentDesign } from '../../core/template.service';
import { DesignSheet } from '../../pages/template-builder/design-sheet';
import {
  documentStamp,
  quotationDesignContext,
} from '../../pages/template-builder/document-context';

export type QuotationSheetData = Pick<
  Quotation,
  | 'number'
  | 'revision'
  | 'status'
  | 'expired'
  | 'issueDate'
  | 'validUntil'
  | 'currency'
  | 'referenceNumber'
  | 'recipient'
  | 'company'
  | 'items'
  | 'totals'
  | 'notes'
  | 'terms'
  | 'signature'
>;

/** A quotation on an A4 sheet in its template; mirrors the quotation PDF. */
@Component({
  selector: 'app-quotation-sheet',
  imports: [PricedSheet, DesignSheet],
  template: `
    @if (design(); as custom) {
      <app-design-sheet
        [page]="custom.page"
        [elements]="custom.elements"
        [context]="designContext()"
        [stamp]="designStamp()"
        [designId]="custom.id"
        [testId]="testId()"
      />
    } @else {
      <app-priced-sheet
        [doc]="doc()"
        [templateKey]="templateKey()"
        [accentColor]="accentColor()"
        [testId]="testId()"
        prefix="quotation"
      />
    }
  `,
  styles: ':host { display: block; }',
})
export class QuotationSheet {
  readonly quotation = input.required<QuotationSheetData>();
  readonly templateKey = input<string>('classic');
  readonly accentColor = input<string>('#2563eb');
  /** A template-builder design: drawn instead of the built-in layout. */
  readonly design = input<DocumentDesign | null | undefined>(null);

  protected readonly designContext = computed(() => quotationDesignContext(this.quotation()));
  protected readonly designStamp = computed(() => {
    const doc = this.quotation();
    return documentStamp(
      doc.status,
      (doc as { supersededRevision?: { revision: number } }).supersededRevision?.revision,
    );
  });
  readonly testId = input('quotation-sheet');

  protected readonly doc = computed<PricedSheetData>(() => {
    const q = this.quotation();
    const money = (value: number) => formatMoney(value, q.currency);
    const display = quotationDisplayStatus(q);
    const attention = q.recipient.attention;
    const details = [
      { label: 'Quotation date', value: formatDate(q.issueDate) },
      { label: 'Valid until', value: formatDate(q.validUntil) },
    ];
    if (q.referenceNumber) details.push({ label: 'Reference', value: q.referenceNumber });
    const totals = [{ label: 'Subtotal', value: money(q.totals.subtotal) }];
    if (q.totals.discountTotal > 0) {
      totals.push({ label: 'Discount', value: `-${money(q.totals.discountTotal)}` });
    }
    if (q.totals.taxTotal > 0) totals.push({ label: 'Tax', value: money(q.totals.taxTotal) });

    return {
      title: 'QUOTATION',
      titleCase: 'Quotation',
      number: `${q.number ?? 'Draft'}${q.revision > 1 ? ` · Rev. ${q.revision}` : ''}`,
      statusLabel: QUOTATION_STATUS_LABEL[display],
      statusClass: quotationStatusClass(display),
      company: q.company,
      party: {
        heading: 'Quotation for',
        preparedHeading: 'Prepared for',
        name: q.recipient.name,
        attention: attention
          ? `Attn. ${attention.name}${attention.jobTitle ? ` · ${attention.jobTitle}` : ''}`
          : null,
        lines: [q.recipient.address, q.recipient.email, q.recipient.phone].filter(
          (line): line is string => Boolean(line),
        ),
      },
      details,
      currency: q.currency,
      items: q.items,
      totals,
      grandTotal: money(q.totals.grandTotal),
      settlement: [],
      sections: [
        { label: 'Notes', body: q.notes },
        { label: 'Terms & conditions', body: q.terms },
      ],
      signature: {
        date: formatDate(q.issueDate),
        greeting: 'Sincerely,',
        name: q.signature.name || q.company.name,
        title: q.signature.title || 'Authorised signature',
        imageDataUrl: q.signature.imageDataUrl,
      },
    };
  });
}
