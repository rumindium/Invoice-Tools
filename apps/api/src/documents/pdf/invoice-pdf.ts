import { DocumentType } from '../../database/entities/enums';
import { terminText } from '../../termins/termin-math';
import { numberWithRevision } from '../revisions';
import type { InvoiceView } from '../views';
import { formatDate, formatMoney } from './pdf-helpers';
import type { PricedDocument } from './priced/model';
import { renderPricedPdf } from './priced/render';
import { invoiceDesignData } from '../../template-designs/design-data';
import { renderWithDesign } from '../../template-designs/design-render';

/**
 * Invoice PDF: A4 portrait in the invoice's template (Classic, Modern, Minimal, Elegant or
 * Bold) and the company's accent colour — the same layouts as quotations. Every layout carries
 * the issuer, the billed customer with attention line, invoice and due dates, the source
 * quotation and goods receipt for generated invoices, the item table, totals with charges,
 * paid and balance due, notes, terms, the void reason, and the issuer's signature.
 */

export function invoiceStatusLabel(
  invoice: Pick<InvoiceView, 'status' | 'overdue'> &
    Partial<Pick<InvoiceView, 'supersededRevision'>>,
): string {
  if (invoice.supersededRevision) {
    return `SUPERSEDED · VERSION ${invoice.supersededRevision.revision}`;
  }
  if (invoice.overdue) return 'OVERDUE';
  return invoice.status.replace(/_/g, ' ');
}

export function invoiceDocument(invoice: InvoiceView): PricedDocument {
  const money = (value: number) => formatMoney(value, invoice.currency);
  const { customer, company, totals } = invoice;
  const contact = customer.contact;

  const details: Array<[string, string]> = [
    ['Invoice date', formatDate(invoice.issueDate)],
    ['Due date', formatDate(invoice.dueDate)],
  ];
  if (invoice.referenceNumber) details.push(['Reference', invoice.referenceNumber]);
  // Invoices generated from a goods receipt cite their source documents.
  if (invoice.flow?.quotation?.number) details.push(['Quotation', invoice.flow.quotation.number]);
  if (invoice.flow?.goodsReceipt.number) {
    details.push(['Goods receipt', invoice.flow.goodsReceipt.number]);
  }
  // Payment termins: "1 of 3 · 30%".
  if (invoice.termin) details.push(['Termin', terminText(invoice.termin)]);

  const totalRows: Array<[string, string]> = [['Subtotal', money(totals.subtotal)]];
  if (totals.discountTotal > 0) totalRows.push(['Discount', money(-totals.discountTotal)]);
  if (totals.taxTotal > 0) totalRows.push(['Tax', money(totals.taxTotal)]);
  if (totals.shippingAmount > 0) totalRows.push(['Shipping', money(totals.shippingAmount)]);
  if (totals.additionalCharges > 0) {
    totalRows.push(['Additional charges', money(totals.additionalCharges)]);
  }
  if (totals.chargesTax > 0) totalRows.push(['Charges tax', money(totals.chargesTax)]);

  return {
    title: 'INVOICE',
    titleCase: 'Invoice',
    number: numberWithRevision(invoice.number, invoice.revision),
    status: invoiceStatusLabel(invoice),
    company,
    party: {
      heading: 'Billed to',
      preparedHeading: 'Billed to',
      name: customer.name,
      attention: contact
        ? `Attn. ${contact.name}${contact.jobTitle ? ` · ${contact.jobTitle}` : ''}${
            contact.phone ? ` · ${contact.phone}` : ''
          }`
        : null,
      lines: [customer.address, customer.email, customer.phone].filter((line): line is string =>
        Boolean(line),
      ),
    },
    details,
    currency: invoice.currency,
    items: invoice.items,
    totals: totalRows,
    grandTotal: money(totals.grandTotal),
    settlement:
      totals.amountPaid > 0
        ? [
            ['Paid', money(totals.amountPaid)],
            ['Balance due', money(totals.balanceDue)],
          ]
        : [],
    sections: [
      { label: 'Notes', body: invoice.notes },
      { label: 'Terms', body: invoice.terms },
      ...(invoice.voidedAt
        ? [{ label: 'Voided', body: invoice.voidReason || 'Voided', tone: 'danger' as const }]
        : []),
    ],
    signature: company.signatoryName
      ? {
          date: formatDate(invoice.issueDate),
          greeting: 'Issued by,',
          name: company.signatoryName,
          title: company.signatoryTitle || 'Authorised signature',
          imageDataUrl: null,
          compact: true,
        }
      : null,
    footer:
      company.footerText?.trim() ||
      `Generated with Rumindium Invoice · ${invoice.number ?? 'Draft'}`,
  };
}

export function renderInvoicePdf(invoice: InvoiceView): Promise<Buffer> {
  const info = {
    title: `Invoice ${invoice.number ?? ''}`.trim(),
    subject: `Invoice for ${invoice.customer.name}`,
    author: invoice.company.name,
  };
  const custom = renderWithDesign(invoice.template, () => invoiceDesignData(invoice), info);
  if (custom) return custom;
  return renderPricedPdf(invoiceDocument(invoice), invoice.template, DocumentType.INVOICE, {
    title: `Invoice ${invoice.number ?? ''}`.trim(),
    subject: `Invoice for ${invoice.customer.name}`,
  });
}
