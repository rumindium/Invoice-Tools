import { Company } from '../../core/company.service';
import { GoodsReceiptSheetData } from '../../ui/goods-receipt-sheet/goods-receipt-sheet';
import { InvoiceSheetData } from '../../ui/invoice-sheet/invoice-sheet';
import { QuotationSheetData } from '../../ui/quotation-sheet/quotation-sheet';

/** Sample documents on the company's letterhead, used to preview templates. */

function isoDate(offsetDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function letterhead(company: Company | null) {
  return {
    id: company?.id ?? 'sample',
    name: company?.displayName?.trim() || company?.legalName || 'Your company',
    address: company?.address ?? 'Your company address',
    email: company?.email ?? null,
    phone: company?.phone ?? null,
    taxId: company?.taxId ?? null,
    logoDataUrl: company?.logoDataUrl ?? null,
    footerText: company?.footerText ?? null,
  };
}

const RECIPIENT = {
  id: null,
  name: 'PT Kopi Senja Nusantara',
  email: 'procurement@kopisenja.id',
  address: 'Jl. Braga No. 12, Bandung',
  phone: '+62 22 555 0199',
  attention: { id: null, name: 'Rina Wijaya', jobTitle: 'Procurement Lead', phone: null },
};

function quotationItem(
  position: number,
  name: string,
  description: string,
  unit: string,
  quantity: number,
  unitPrice: number,
) {
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
    discountType: 'NONE' as const,
    discountRate: null,
    discountAmount: 0,
    taxRate: 11,
    taxAmount,
    lineTotal: net + taxAmount,
  };
}

export function sampleQuotation(company: Company | null): QuotationSheetData {
  const items = [
    quotationItem(
      1,
      'Brand identity design',
      'Logo, colour palette and typography guide',
      'project',
      1,
      6_500_000,
    ),
    quotationItem(2, 'Landing page build', 'Responsive, up to 5 sections', 'page', 1, 4_000_000),
    quotationItem(3, 'Support retainer', 'Monthly updates and fixes', 'month', 2, 800_000),
  ];
  const subtotal = items.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  const taxTotal = items.reduce((sum, line) => sum + line.taxAmount, 0);

  return {
    number: 'QUO/SAMPLE/0001',
    revision: 1,
    status: 'DRAFT',
    expired: false,
    issueDate: isoDate(0),
    validUntil: isoDate(30),
    currency: company?.defaultCurrency ?? 'IDR',
    referenceNumber: 'RFQ-2041',
    recipient: RECIPIENT,
    company: letterhead(company),
    items,
    totals: { subtotal, discountTotal: 0, taxTotal, grandTotal: subtotal + taxTotal },
    notes: 'This is a sample quotation showing how your quotations will look.',
    terms: 'Prices are valid until the date above. Work starts after written approval.',
    signature: {
      name: company?.signatoryName ?? null,
      title: company?.signatoryTitle ?? null,
      imageDataUrl: null,
    },
  };
}

function receiptLine(
  position: number,
  name: string,
  description: string | null,
  unit: string,
  ordered: number,
  rejected: number,
  remarks: string | null,
) {
  return {
    id: `sample-${position}`,
    position,
    catalogItemId: null,
    name,
    description,
    unit,
    orderedQuantity: ordered,
    receivedQuantity: ordered,
    rejectedQuantity: rejected,
    acceptedQuantity: ordered - rejected,
    remarks,
  };
}

export function sampleGoodsReceipt(company: Company | null): GoodsReceiptSheetData {
  const lines = [
    receiptLine(
      1,
      'Arabica coffee beans 1 kg',
      'Single origin, vacuum packed',
      'bag',
      40,
      2,
      '2 bags torn',
    ),
    receiptLine(2, 'Paper cups 12 oz', 'Double wall, printed logo', 'carton', 25, 0, null),
    receiptLine(3, 'Espresso machine cleaner', null, 'bottle', 12, 1, 'Seal broken'),
  ];
  const sum = (pick: (line: (typeof lines)[number]) => number) =>
    lines.reduce((total, line) => total + pick(line), 0);

  return {
    number: 'GR/SAMPLE/0001',
    revision: 1,
    status: 'DRAFT',
    receiptDate: isoDate(0),
    source: {
      quotationId: 'sample-quotation',
      quotationNumber: 'QUO/SAMPLE/0007',
      quotationDate: isoDate(-7),
      customerReference: 'PO-2041',
    },
    details: {
      deliveryNoteNumber: 'DN-0815',
      carrier: 'JNE Trucking',
      vehicleNumber: 'B 9123 KJT',
      receivingLocation: 'Warehouse 2, Jl. Braga No. 12, Bandung',
      deliveredByName: company?.signatoryName ?? null,
      receivedByName: 'Rina Wijaya',
      receivedByTitle: 'Procurement Lead',
      checkedByName: 'Dedi Kurniawan',
    },
    recipient: RECIPIENT,
    company: letterhead(company),
    lines,
    totals: {
      ordered: sum((line) => line.orderedQuantity),
      received: sum((line) => line.receivedQuantity),
      rejected: sum((line) => line.rejectedQuantity),
      accepted: sum((line) => line.acceptedQuantity),
      acceptedValue: 0,
    },
    notes: 'This is a sample goods receipt showing how your goods receipts will look.',
    cancelReason: null,
  };
}

/** A partly paid invoice, so the preview shows paid and balance due too. */
export function sampleInvoice(company: Company | null): InvoiceSheetData {
  const items = [
    quotationItem(
      1,
      'Brand identity design',
      'Logo, colour palette and typography guide',
      'project',
      1,
      6_500_000,
    ),
    quotationItem(2, 'Landing page build', 'Responsive, up to 5 sections', 'page', 1, 4_000_000),
    quotationItem(3, 'Support retainer', 'Monthly updates and fixes', 'month', 2, 800_000),
  ];
  const subtotal = items.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  const taxTotal = items.reduce((sum, line) => sum + line.taxAmount, 0);
  const grandTotal = subtotal + taxTotal;
  const amountPaid = 5_000_000;

  return {
    number: 'INV/SAMPLE/0001',
    revision: 1,
    status: 'PARTIALLY_PAID',
    overdue: false,
    issueDate: isoDate(0),
    dueDate: isoDate(company?.defaultPaymentTermDays ?? 14),
    currency: company?.defaultCurrency ?? 'IDR',
    referenceNumber: 'PO-2041',
    customer: {
      id: null,
      name: RECIPIENT.name,
      email: 'finance@kopisenja.id',
      address: RECIPIENT.address,
      phone: RECIPIENT.phone,
      contact: { id: null, name: 'Rina Wijaya', jobTitle: 'Finance Lead', phone: null },
    },
    company: {
      ...letterhead(company),
      signatoryName: company?.signatoryName ?? null,
      signatoryTitle: company?.signatoryTitle ?? null,
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
    notes: 'This is a sample invoice showing how your invoices will look.',
    terms: 'Payment within 14 days by bank transfer. Please quote the invoice number.',
    voidedAt: null,
    voidReason: null,
    flow: null,
  };
}
