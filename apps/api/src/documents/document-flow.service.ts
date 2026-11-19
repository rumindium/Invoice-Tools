import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AuditEvent, Document, DocumentItem } from '../database/entities';
import { DocumentType } from '../database/entities/enums';
import { isExpired } from '../quotations/quotation-status';
import { convertedFromId } from './document-links';
import type { FlowEvent, InvoiceFlowView } from './views';

const TARGET_TYPES: Record<string, FlowEvent['documentType']> = {
  quotation: 'QUOTATION',
  goods_receipt: 'GOODS_RECEIPT',
  invoice: 'INVOICE',
};

/**
 * Reconstructs quotation → goods receipt → invoice for an invoice generated from a goods
 * receipt, with one merged, chronological history of the three documents.
 */
@Injectable()
export class DocumentFlowService {
  constructor(
    @InjectRepository(Document) private readonly documents: Repository<Document>,
    @InjectRepository(AuditEvent) private readonly audit: Repository<AuditEvent>,
  ) {}

  async forInvoice(invoice: Document): Promise<InvoiceFlowView | null> {
    const manager = this.documents.manager;
    const receiptId = await convertedFromId(manager, invoice.id, DocumentType.GOODS_RECEIPT);

    if (!receiptId) {
      return null;
    }

    const quotationId = await convertedFromId(manager, receiptId, DocumentType.QUOTATION);
    const [receipt, quotation] = await Promise.all([
      this.documents.findOne({ where: { id: receiptId }, relations: { items: true } }),
      quotationId ? this.documents.findOne({ where: { id: quotationId } }) : null,
    ]);

    if (!receipt) {
      return null;
    }

    const items = (receipt as Document & { items: DocumentItem[] }).items;
    const acceptedQuantity = items.reduce(
      (total, item) => total + item.quantity.minus(item.rejectedQuantity ?? 0).toNumber(),
      0,
    );

    const numbers = new Map<string, string | null>([
      [invoice.id, invoice.documentNumber],
      [receipt.id, receipt.documentNumber],
    ]);
    if (quotation) numbers.set(quotation.id, quotation.documentNumber);

    const events = await this.audit.find({
      where: {
        targetId: In([...numbers.keys()]),
        targetType: In(Object.keys(TARGET_TYPES)),
      },
      relations: { actor: true },
      order: { createdAt: 'ASC', id: 'ASC' },
    });

    return {
      quotation: quotation
        ? {
            id: quotation.id,
            number: quotation.documentNumber,
            date: quotation.issueDate,
            status: quotation.status,
            expired: isExpired(quotation.status, quotation.validUntil),
            total: Number(quotation.grandTotal),
            currency: quotation.currencyCode,
          }
        : null,
      goodsReceipt: {
        id: receipt.id,
        number: receipt.documentNumber,
        date: receipt.issueDate,
        status: receipt.status,
        acceptedQuantity: Number(acceptedQuantity.toFixed(4)),
        lineCount: items.length,
      },
      invoice: {
        id: invoice.id,
        number: invoice.documentNumber,
        date: invoice.issueDate,
        status: invoice.status,
        total: Number(invoice.grandTotal),
        currency: invoice.currencyCode,
      },
      events: events.map((event) => {
        const metadata = (event.metadata ?? {}) as {
          from?: string | null;
          to?: string | null;
          reason?: string | null;
          revision?: number | null;
          termin?: { sequence: number; count: number; percentage: number } | null;
        };
        return {
          id: String(event.id),
          at: event.createdAt.toISOString(),
          documentType: TARGET_TYPES[event.targetType]!,
          documentId: event.targetId,
          documentNumber: numbers.get(event.targetId) ?? null,
          action: event.action,
          fromStatus: metadata.from ?? null,
          toStatus: metadata.to ?? null,
          reason: metadata.reason ?? null,
          revision: metadata.revision ?? null,
          termin: metadata.termin ?? null,
          actorName: event.actor?.displayName ?? null,
        };
      }),
    };
  }
}
