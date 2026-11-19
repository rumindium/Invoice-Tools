import { Component, computed, input } from '@angular/core';
import { formatDate, formatMoney } from '../../core/format';
import { Invoice, STATUS_LABEL, displayStatus, statusClass } from '../../core/invoice.service';
import { terminLabel } from '../../core/termin.service';
import { PricedSheet, PricedSheetData } from '../priced-sheet/priced-sheet';
import { DocumentDesign } from '../../core/template.service';
import { DesignSheet } from '../../pages/template-builder/design-sheet';
import { documentStamp, invoiceDesignContext } from '../../pages/template-builder/document-context';

export type InvoiceSheetData = Pick<
  Invoice,
  | 'number'
  | 'revision'
  | 'status'
  | 'overdue'
  | 'issueDate'
  | 'dueDate'
  | 'currency'
  | 'referenceNumber'
  | 'customer'
  | 'company'
  | 'items'
  | 'totals'
  | 'notes'
  | 'terms'
  | 'voidedAt'
  | 'voidReason'
  | 'flow'
> &
  Partial<Pick<Invoice, 'termin'>>;

/** An invoice on an A4 sheet in its template; mirrors the invoice PDF. */
@Component({
  selector: 'app-invoice-sheet',
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
        prefix="invoice"
      />
    }
  `,
  styles: ':host { display: block; }',
})
export class InvoiceSheet {
  readonly invoice = input.required<InvoiceSheetData>();
  readonly templateKey = input<string>('classic');
  readonly accentColor = input<string>('#2563eb');
  /** A template-builder design: drawn instead of the built-in layout. */
  readonly design = input<DocumentDesign | null | undefined>(null);

  protected readonly designContext = computed(() => invoiceDesignContext(this.invoice()));
  protected readonly designStamp = computed(() => {
    const doc = this.invoice();
    return documentStamp(
      doc.status,
      (doc as { supersededRevision?: { revision: number } }).supersededRevision?.revision,
    );
  });
  readonly testId = input('invoice-sheet');

  protected readonly doc = computed<PricedSheetData>(() => {
    const inv = this.invoice();
    const money = (value: number) => formatMoney(value, inv.currency);
    const display = displayStatus(inv);
    const contact = inv.customer.contact;
    const { totals } = inv;

    const details = [
      { label: 'Invoice date', value: formatDate(inv.issueDate) },
      { label: 'Due date', value: formatDate(inv.dueDate) },
    ];
    if (inv.referenceNumber) details.push({ label: 'Reference', value: inv.referenceNumber });
    // Invoices generated from a goods receipt cite their source documents.
    if (inv.flow?.quotation?.number) {
      details.push({ label: 'Quotation', value: inv.flow.quotation.number });
    }
    if (inv.flow?.goodsReceipt.number) {
      details.push({ label: 'Goods receipt', value: inv.flow.goodsReceipt.number });
    }
    // Payment termins: "1 of 3 · 30%".
    if (inv.termin) {
      details.push({ label: 'Termin', value: terminLabel(inv.termin).replace(/^Termin /, '') });
    }

    const totalRows = [{ label: 'Subtotal', value: money(totals.subtotal) }];
    if (totals.discountTotal > 0) {
      totalRows.push({ label: 'Discount', value: `-${money(totals.discountTotal)}` });
    }
    if (totals.taxTotal > 0) totalRows.push({ label: 'Tax', value: money(totals.taxTotal) });
    if (totals.shippingAmount > 0) {
      totalRows.push({ label: 'Shipping', value: money(totals.shippingAmount) });
    }
    if (totals.additionalCharges > 0) {
      totalRows.push({ label: 'Additional charges', value: money(totals.additionalCharges) });
    }
    if (totals.chargesTax > 0) {
      totalRows.push({ label: 'Charges tax', value: money(totals.chargesTax) });
    }

    return {
      title: 'INVOICE',
      titleCase: 'Invoice',
      number: `${inv.number ?? 'Draft'}${inv.revision > 1 ? ` · Rev. ${inv.revision}` : ''}`,
      statusLabel: STATUS_LABEL[display],
      statusClass: statusClass(display),
      company: inv.company,
      party: {
        heading: 'Billed to',
        preparedHeading: 'Billed to',
        name: inv.customer.name,
        attention: contact
          ? `Attn. ${contact.name}${contact.jobTitle ? ` · ${contact.jobTitle}` : ''}${
              contact.phone ? ` · ${contact.phone}` : ''
            }`
          : null,
        lines: [inv.customer.address, inv.customer.email, inv.customer.phone].filter(
          (line): line is string => Boolean(line),
        ),
      },
      details,
      currency: inv.currency,
      items: inv.items,
      totals: totalRows,
      grandTotal: money(totals.grandTotal),
      settlement:
        totals.amountPaid > 0
          ? [
              { label: 'Paid', value: money(totals.amountPaid) },
              { label: 'Balance due', value: money(totals.balanceDue) },
            ]
          : [],
      sections: [
        { label: 'Notes', body: inv.notes },
        { label: 'Terms', body: inv.terms },
        ...(inv.voidedAt
          ? [{ label: 'Voided', body: inv.voidReason || 'Voided', tone: 'danger' as const }]
          : []),
      ],
      signature: inv.company.signatoryName
        ? {
            date: formatDate(inv.issueDate),
            greeting: 'Issued by,',
            name: inv.company.signatoryName,
            title: inv.company.signatoryTitle || 'Authorised signature',
            imageDataUrl: null,
            compact: true,
          }
        : null,
    };
  });
}
