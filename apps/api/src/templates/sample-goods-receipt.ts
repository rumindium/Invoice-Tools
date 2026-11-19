import type { Company } from '../database/entities';
import type { GoodsReceiptLineView, GoodsReceiptView } from '../goods-receipts/views';
import type { DocumentTemplateView } from './template-snapshot';

function isoDate(offsetDays: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function line(
  position: number,
  name: string,
  description: string | null,
  unit: string,
  ordered: number,
  rejected: number,
  remarks: string | null,
): GoodsReceiptLineView {
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

/** A realistic goods receipt note on the company's letterhead, used to preview templates. */
export function sampleGoodsReceipt(
  company: Company,
  template: Omit<DocumentTemplateView, 'locked'>,
): GoodsReceiptView {
  const lines = [
    line(
      1,
      'Arabica coffee beans 1 kg',
      'Single origin, vacuum packed',
      'bag',
      40,
      2,
      '2 bags torn',
    ),
    line(2, 'Paper cups 12 oz', 'Double wall, printed logo', 'carton', 25, 0, null),
    line(3, 'Espresso machine cleaner', null, 'bottle', 12, 1, 'Seal broken'),
  ];
  const sum = (pick: (row: GoodsReceiptLineView) => number) =>
    lines.reduce((total, row) => total + pick(row), 0);
  const now = new Date().toISOString();

  return {
    id: 'sample',
    number: 'GR/SAMPLE/0001',
    status: 'DRAFT',
    receiptDate: isoDate(0),
    currency: company.defaultCurrency,
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
      deliveredByName: company.signatoryName,
      receivedByName: 'Rina Wijaya',
      receivedByTitle: 'Procurement Lead',
      checkedByName: 'Dedi Kurniawan',
    },
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
    lines,
    totals: {
      ordered: sum((row) => row.orderedQuantity),
      received: sum((row) => row.receivedQuantity),
      rejected: sum((row) => row.rejectedQuantity),
      accepted: sum((row) => row.acceptedQuantity),
      acceptedValue: 0,
    },
    notes: 'This is a sample goods receipt showing how your goods receipts will look.',
    template: { ...template, locked: false },
    history: [],
    nextStatuses: [],
    invoice: null,
    canCreateInvoice: false,
    canSplitInvoice: false,
    termin: null,
    terminPlan: null,
    invoiceTerminPlan: null,
    receivedAt: null,
    cancelledAt: null,
    cancelReason: null,
    createdAt: now,
    updatedAt: now,
    revision: 1,
    revisions: [],
    canRevise: false,
    revisionBlockedBy: null,
  };
}
