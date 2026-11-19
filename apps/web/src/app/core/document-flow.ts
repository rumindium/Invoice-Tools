import type { InvoiceFlowEvent } from './invoice.service';
import { withTermin } from './termin.service';

/** Status names across quotations, goods receipts and invoices. */
export const DOCUMENT_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft',
  SENT: 'Sent',
  ACCEPTED: 'Accepted',
  REJECTED: 'Rejected',
  EXPIRED: 'Expired',
  RECEIVED: 'Received',
  CANCELLED: 'Cancelled',
  ISSUED: 'Issued',
  PARTIALLY_PAID: 'Partially paid',
  PAID: 'Paid',
  OVERDUE: 'Overdue',
  VOID: 'Void',
};

export const DOCUMENT_TYPE_LABEL: Record<InvoiceFlowEvent['documentType'], string> = {
  QUOTATION: 'Quotation',
  GOODS_RECEIPT: 'Goods receipt',
  INVOICE: 'Invoice',
};

export const DOCUMENT_TYPE_MARK: Record<InvoiceFlowEvent['documentType'], string> = {
  QUOTATION: 'Q',
  GOODS_RECEIPT: 'GR',
  INVOICE: 'INV',
};

const FIXED_TITLES: Record<string, string> = {
  'quotation.created': 'Quotation created',
  'quotation.updated': 'Quotation edited',
  'quotation.goods_receipt_created': 'Goods receipt generated from the quotation',
  'goods_receipt.created': 'Goods receipt created',
  'goods_receipt.updated': 'Goods receipt counts recorded',
  'goods_receipt.invoice_created': 'Invoice generated from the goods receipt',
  'quotation.termin_plan_created': 'Quotation split into payment termins',
  'quotation.termin_plan_updated': 'Termin split of the quotation changed',
  'goods_receipt.termin_plan_created': 'Goods receipt split into payment termins',
  'goods_receipt.termin_plan_updated': 'Termin split of the goods receipt changed',
  'invoice.created': 'Invoice created',
  'invoice.updated': 'Invoice edited',
  'invoice.follow_up_added': 'Follow-up added',
  'invoice.follow_up_status_changed': 'Follow-up status changed',
  'invoice.follow_up_deleted': 'Follow-up deleted',
};

export function statusLabel(status: string | null): string {
  return status ? (DOCUMENT_STATUS_LABEL[status] ?? status) : '—';
}

export function flowEventTitle(event: InvoiceFlowEvent): string {
  const fixed = FIXED_TITLES[event.action];
  if (fixed) return withTermin(fixed, event);

  if (event.action.endsWith('.revised')) {
    return `${DOCUMENT_TYPE_LABEL[event.documentType]} revised to version ${event.revision ?? '?'}`;
  }

  if (event.action.endsWith('.status_changed')) {
    return `${DOCUMENT_TYPE_LABEL[event.documentType]} ${statusLabel(event.fromStatus)} → ${statusLabel(event.toStatus)}`;
  }

  return event.action;
}

export function documentLink(type: InvoiceFlowEvent['documentType'], id: string): string[] {
  switch (type) {
    case 'QUOTATION':
      return ['/quotations', id];
    case 'GOODS_RECEIPT':
      return ['/goods-receipts', id];
    default:
      return ['/documents', id];
  }
}
