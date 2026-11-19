import { Company, DEFAULT_COMPANY_LOGO } from '../../core/company.service';
import { formatDate, formatMoney } from '../../core/format';
import { sampleInvoice } from '../templates/samples';
import { DesignKind, SampleContext } from './builder.model';

const TITLES: Record<DesignKind, string> = {
  invoice: 'Invoice',
  quotation: 'Quotation',
  'goods-receipt': 'Goods receipt',
};

const PREFIX: Record<DesignKind, string> = {
  invoice: 'INV',
  quotation: 'QUO',
  'goods-receipt': 'GRN',
};

/**
 * Values for every data field, built from the workspace's company profile and the same sample
 * invoice the template gallery uses, so previews look like a real document.
 */
export function buildSampleContext(company: Company | null, kind: DesignKind): SampleContext {
  const invoice = sampleInvoice(company);
  const money = (value: number) => formatMoney(value, invoice.currency);
  const letterhead = invoice.company;
  const customer = invoice.customer;
  const totals = invoice.totals;

  const values: Record<string, string> = {
    'document.title': TITLES[kind],
    'document.number': (invoice.number ?? 'INV/SAMPLE/0001').replace('INV', PREFIX[kind]),
    'document.date': formatDate(invoice.issueDate),
    'document.dueDate': formatDate(invoice.dueDate),
    'document.reference': invoice.referenceNumber ?? 'PO-2041',
    'document.currency': invoice.currency,
    'document.total': money(totals.grandTotal),
    'document.balance': money(totals.balanceDue),
    'document.notes': invoice.notes ?? '',
    'document.terms': invoice.terms ?? '',
    'company.name': letterhead.name,
    'company.address': letterhead.address ?? 'Your company address',
    'company.phone': letterhead.phone ?? '+62 21 555 0100',
    'company.email': letterhead.email ?? 'hello@yourcompany.com',
    'company.website': company?.website ?? 'www.yourcompany.com',
    'company.taxId': letterhead.taxId ?? '01.234.567.8-901.000',
    'company.footer': letterhead.footerText ?? 'Thank you for your business.',
    'customer.name': customer.name,
    'customer.address': customer.address ?? '',
    'customer.email': customer.email ?? '',
    'customer.phone': customer.phone ?? '',
    'customer.contact': customer.contact?.name ?? '',
    'signatory.name': letterhead.signatoryName ?? 'Authorised signatory',
    'signatory.title': letterhead.signatoryTitle ?? 'Director',
  };

  return {
    values,
    rows: invoice.items.map((item) => ({
      index: String(item.position),
      description: item.name,
      detail: item.description ?? '',
      quantity: String(item.quantity),
      unit: item.unit ?? '',
      price: money(item.unitPrice),
      tax: `${item.taxRate}%`,
      amount: money(item.quantity * item.unitPrice),
    })),
    totals: {
      subtotal: money(totals.subtotal),
      discount: money(-totals.discountTotal),
      tax: money(totals.taxTotal),
      total: money(totals.grandTotal),
      paid: money(totals.amountPaid),
      balance: money(totals.balanceDue),
    },
    logoSrc: company?.logoDataUrl ?? DEFAULT_COMPANY_LOGO,
  };
}
