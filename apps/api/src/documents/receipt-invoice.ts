import type { EntityManager } from 'typeorm';
import { Decimal } from '../database/decimal.transformer';
import { Document, DocumentItem } from '../database/entities';
import { DiscountType, DocumentType } from '../database/entities/enums';
import { receiptDetails } from '../goods-receipts/views';
import { quantityShare, type TerminBounds } from '../termins/termin-math';
import {
  calculateDocument,
  roundMoney,
  type CalculationItemInput,
  type CalculationResult,
} from './calculation';

/** A received goods receipt with its lines and the quotation it came from. */
export interface ReceiptInvoiceSource {
  receipt: Document;
  lines: DocumentItem[];
  quotation: Document | null;
  quotationItems: DocumentItem[];
}

export type ReceiptInvoiceItem = CalculationItemInput & { catalogItemId: string | null };

export interface ReceiptInvoiceContent {
  items: ReceiptInvoiceItem[];
  taxMode: 'EXCLUSIVE' | 'INCLUSIVE';
  discountType: 'NONE' | 'PERCENT' | 'AMOUNT';
  calculation: CalculationResult;
}

/** `amount × part / whole`, rounded to cents; zero when there is no whole. */
function prorate(amount: Decimal, part: Decimal, whole: Decimal): Decimal {
  return whole.gt(0) ? roundMoney(amount.mul(part).div(whole)) : new Decimal(0);
}

export async function loadReceiptInvoiceSource(
  manager: EntityManager,
  receipt: Document,
): Promise<ReceiptInvoiceSource> {
  const lines = await manager.getRepository(DocumentItem).find({
    where: { documentId: receipt.id },
    order: { position: 'ASC' },
  });
  const details = receiptDetails(receipt);
  const quotation = details.source.quotationId
    ? await manager.getRepository(Document).findOne({
        where: { id: details.source.quotationId, documentType: DocumentType.QUOTATION },
      })
    : null;
  const quotationItems = quotation
    ? await manager.getRepository(DocumentItem).find({ where: { documentId: quotation.id } })
    : [];

  return { receipt, lines, quotation, quotationItems };
}

/**
 * What an invoice of the receipt bills: the accepted quantities (or a termin's share of them)
 * at the quotation's prices, tax rates and discounts. Amount discounts are prorated to what is
 * billed. Null when nothing is left to bill.
 */
export function buildReceiptInvoice(
  { receipt, lines, quotation, quotationItems }: ReceiptInvoiceSource,
  bounds?: TerminBounds,
): ReceiptInvoiceContent | null {
  const billed = lines
    .map((line) => {
      const accepted = line.quantity.minus(line.rejectedQuantity ?? 0);
      return { line, quantity: bounds ? quantityShare(accepted, bounds) : accepted };
    })
    .filter(({ quantity }) => quantity.gt(0));

  if (billed.length === 0) {
    return null;
  }

  // Quotation line for each received line (same position and name), for price and discount.
  const items: ReceiptInvoiceItem[] = billed.map(({ line, quantity }) => {
    const source = quotationItems.find(
      (item) => item.position === line.position && item.itemName === line.itemName,
    );
    // Amount discounts belong to the quoted quantity (a termin receipt orders only a share).
    const ordered = source?.quantity ?? line.orderedQuantity ?? line.quantity;
    const discountType = (source?.discountType ?? DiscountType.NONE) as
      'NONE' | 'PERCENT' | 'AMOUNT';

    return {
      catalogItemId: line.catalogItemId,
      name: line.itemName,
      description: line.description,
      unit: line.unit,
      quantity: quantity.toNumber(),
      unitPrice: (source?.unitPrice ?? line.unitPrice).toNumber(),
      taxRate: (source?.taxRate ?? line.taxRate).toNumber(),
      discountType,
      discountRate: discountType === 'PERCENT' ? (source?.discountRate?.toNumber() ?? 0) : null,
      discountAmount:
        discountType === 'AMOUNT' && source
          ? prorate(source.discountAmount, quantity, ordered).toNumber()
          : null,
    };
  });

  const taxMode = (quotation?.taxMode ?? receipt.taxMode) as 'EXCLUSIVE' | 'INCLUSIVE';
  const discountType = (quotation?.discountType ?? DiscountType.NONE) as
    'NONE' | 'PERCENT' | 'AMOUNT';
  // Line totals first, so an amount discount can be prorated to the billed subtotal.
  const undiscounted = calculateDocument({ items, taxMode, discountType: 'NONE' });
  const documentDiscountAmount =
    discountType === 'AMOUNT' && quotation
      ? prorate(quotation.discountTotal, undiscounted.subtotal, quotation.subtotal)
      : new Decimal(0);
  const calculation = calculateDocument({
    items,
    taxMode,
    discountType,
    discountRate: quotation?.discountRate?.toNumber() ?? null,
    discountAmount: documentDiscountAmount.toNumber(),
  });

  return { items, taxMode, discountType, calculation };
}
