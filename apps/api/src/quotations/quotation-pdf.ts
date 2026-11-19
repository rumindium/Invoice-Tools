import { DocumentType } from '../database/entities/enums';
import { PAGE_HEIGHT, PAGE_WIDTH } from '../documents/pdf/drawing';
import { formatDate, formatMoney } from '../documents/pdf/pdf-helpers';
import type { PricedDocument } from '../documents/pdf/priced/model';
import { renderPricedPdf } from '../documents/pdf/priced/render';
import { numberWithRevision } from '../documents/revisions';
import type { QuotationView } from './views';
import { quotationDesignData } from '../template-designs/design-data';
import { renderWithDesign } from '../template-designs/design-render';

/**
 * Quotation PDF: A4 portrait in the quotation's template (Classic, Modern, Minimal, Elegant or
 * Bold) and the company's accent colour. Every layout carries the issuer, the recipient with
 * attention line, validity, the numbered item table, totals, notes and terms, and the
 * signature block anchored to the bottom-right corner of the last page.
 */

/** The status line printed under the number ("DRAFT", "EXPIRED", "SUPERSEDED · VERSION 1"). */
export function quotationStatusLabel(
  quotation: Pick<QuotationView, 'status' | 'expired'> &
    Partial<Pick<QuotationView, 'supersededRevision'>>,
): string {
  if (quotation.supersededRevision) {
    return `SUPERSEDED · VERSION ${quotation.supersededRevision.revision}`;
  }
  return quotation.expired ? 'EXPIRED' : quotation.status.replace(/_/g, ' ');
}

export function quotationDocument(q: QuotationView): PricedDocument {
  const money = (value: number) => formatMoney(value, q.currency);
  const attention = q.recipient.attention;
  const details: Array<[string, string]> = [
    ['Quotation date', formatDate(q.issueDate)],
    ['Valid until', formatDate(q.validUntil)],
  ];
  if (q.referenceNumber) {
    details.push(['Reference', q.referenceNumber]);
  }
  const totals: Array<[string, string]> = [['Subtotal', money(q.totals.subtotal)]];
  if (q.totals.discountTotal > 0) totals.push(['Discount', money(-q.totals.discountTotal)]);
  if (q.totals.taxTotal > 0) totals.push(['Tax', money(q.totals.taxTotal)]);

  return {
    title: 'QUOTATION',
    titleCase: 'Quotation',
    number: numberWithRevision(q.number, q.revision),
    status: quotationStatusLabel(q),
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
    footer:
      q.company.footerText?.trim() || `Generated with Rumindium Invoice · ${q.number ?? 'Draft'}`,
  };
}

export function renderQuotationPdf(quotation: QuotationView): Promise<Buffer> {
  const info = {
    title: `Quotation ${quotation.number ?? ''}`.trim(),
    subject: `Quotation for ${quotation.recipient.name}`,
    author: quotation.company.name,
  };
  const custom = renderWithDesign(quotation.template, () => quotationDesignData(quotation), info);
  if (custom) return custom;
  return renderPricedPdf(quotationDocument(quotation), quotation.template, DocumentType.QUOTATION, {
    title: `Quotation ${quotation.number ?? ''}`.trim(),
    subject: `Quotation for ${quotation.recipient.name}`,
  });
}

export const QUOTATION_PAGE_SIZE = { width: PAGE_WIDTH, height: PAGE_HEIGHT };
