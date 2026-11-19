import type { Company } from '../database/entities';
import type { InvoiceItemView, InvoiceView } from '../documents/views';
import type { DocumentTemplateView } from './template-snapshot';

function isoDate(offsetDays: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function item(
  position: number,
  name: string,
  description: string | null,
  unit: string,
  quantity: number,
  unitPrice: number,
): InvoiceItemView {
  const net = quantity * unitPrice;
  const taxAmount = Math.round(net * 0.11);
  return {
    id: `sample-${position}`,
    position,
    catalogItemId: null,
    name,
    description,
    unit,
    quantity,
    unitPrice,
    discountType: 'NONE',
    discountRate: null,
    discountAmount: 0,
    taxRate: 11,
    taxAmount,
    lineTotal: net + taxAmount,
  };
}

/** A realistic, partly paid invoice on the company's letterhead, used to preview templates. */
export function sampleInvoice(
  company: Company,
  template: Omit<DocumentTemplateView, 'locked'>,
): InvoiceView {
  const items = [
    item(
      1,
      'Brand identity design',
      'Logo, colour palette and typography guide',
      'project',
      1,
      6_500_000,
    ),
    item(2, 'Landing page build', 'Responsive, up to 5 sections', 'page', 1, 4_000_000),
    item(3, 'Support retainer', 'Monthly updates and fixes', 'month', 2, 800_000),
  ];
  const subtotal = items.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  const taxTotal = items.reduce((sum, line) => sum + line.taxAmount, 0);
  const grandTotal = subtotal + taxTotal;
  const amountPaid = 5_000_000;
  const now = new Date().toISOString();

  return {
    id: 'sample',
    number: 'INV/SAMPLE/0001',
    status: 'PARTIALLY_PAID',
    overdue: false,
    issueDate: isoDate(0),
    dueDate: isoDate(company.defaultPaymentTermDays ?? 14),
    currency: company.defaultCurrency,
    referenceNumber: 'PO-2041',
    taxMode: 'EXCLUSIVE',
    discountType: 'NONE',
    discountRate: null,
    discountAmount: 0,
    customer: {
      id: null,
      name: 'PT Kopi Senja Nusantara',
      email: 'finance@kopisenja.id',
      address: 'Jl. Braga No. 12, Bandung',
      phone: '+62 22 555 0199',
      contact: { id: null, name: 'Rina Wijaya', jobTitle: 'Finance Lead', phone: null },
    },
    company: {
      id: company.id,
      name: company.displayName?.trim() || company.legalName,
      address: company.addressLine1,
      email: company.email,
      phone: company.phone,
      taxId: company.taxId,
      logoDataUrl: company.logoDataUrl,
      footerText: company.footerText,
      signatoryName: company.signatoryName,
      signatoryTitle: company.signatoryTitle,
    },
    items,
    totals: {
      subtotal,
      discountTotal: 0,
      taxTotal,
      shippingAmount: 0,
      additionalCharges: 0,
      chargesTax: 0,
      grandTotal,
      amountPaid,
      balanceDue: grandTotal - amountPaid,
    },
    template: { ...template, locked: false },
    history: [],
    followUps: [],
    nextStatuses: [],
    flow: null,
    termin: null,
    terminPlan: null,
    notes: 'This is a sample invoice showing how your invoices will look.',
    terms: 'Payment within 14 days by bank transfer. Please quote the invoice number.',
    issuedAt: null,
    voidedAt: null,
    voidReason: null,
    createdAt: now,
    updatedAt: now,
    revision: 1,
    revisions: [],
    canRevise: false,
    revisionBlockedBy: null,
  };
}
