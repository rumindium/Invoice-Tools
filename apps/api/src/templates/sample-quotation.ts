import type { Company } from '../database/entities';
import type { QuotationView } from '../quotations/views';
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
  taxRate: number,
) {
  const net = quantity * unitPrice;
  const taxAmount = Math.round((net * taxRate) / 100);
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
    taxRate,
    taxAmount,
    lineTotal: net + taxAmount,
  };
}

/** A realistic quotation on the company's letterhead, used to preview templates. */
export function sampleQuotation(
  company: Company,
  template: Omit<DocumentTemplateView, 'locked'>,
): QuotationView {
  const items = [
    item(
      1,
      'Brand identity design',
      'Logo, colour palette and typography guide',
      'project',
      1,
      6_500_000,
      11,
    ),
    item(2, 'Landing page build', 'Responsive, up to 5 sections', 'page', 1, 4_000_000, 11),
    item(3, 'Support retainer', 'Monthly updates and fixes', 'month', 2, 800_000, 11),
  ];
  const subtotal = items.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  const taxTotal = items.reduce((sum, line) => sum + line.taxAmount, 0);
  const now = new Date().toISOString();

  return {
    id: 'sample',
    number: 'QUO/SAMPLE/0001',
    status: 'DRAFT',
    expired: false,
    issueDate: isoDate(0),
    validUntil: isoDate(30),
    currency: company.defaultCurrency,
    referenceNumber: 'RFQ-2041',
    taxMode: 'EXCLUSIVE',
    discountType: 'NONE',
    discountRate: null,
    discountAmount: 0,
    recipient: {
      id: null,
      name: 'PT Kopi Senja Nusantara',
      email: 'procurement@kopisenja.id',
      address: 'Jl. Braga No. 12, Bandung',
      phone: '+62 22 555 0199',
      attention: { id: null, name: 'Rina Wijaya', jobTitle: 'Procurement Lead', phone: null },
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
    },
    items,
    totals: { subtotal, discountTotal: 0, taxTotal, grandTotal: subtotal + taxTotal },
    signature: {
      name: company.signatoryName,
      title: company.signatoryTitle,
      imageDataUrl: null,
    },
    template: { ...template, locked: false },
    history: [],
    nextStatuses: [],
    goodsReceipt: null,
    canCreateGoodsReceipt: false,
    terminPlan: null,
    invoice: null,
    notes: 'This is a sample quotation showing how your quotations will look.',
    terms: 'Prices are valid until the date above. Work starts after written approval.',
    sentAt: null,
    createdAt: now,
    updatedAt: now,
    revision: 1,
    revisions: [],
    canRevise: false,
    revisionBlockedBy: null,
  };
}
