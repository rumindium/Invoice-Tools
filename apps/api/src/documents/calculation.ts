import Decimal from 'decimal.js';

const Money = Decimal;
const CENTS = 2;

export function roundMoney(value: Decimal): Decimal {
  return value.toDecimalPlaces(CENTS, Money.ROUND_HALF_UP);
}

export interface CalculationItemInput {
  name: string;
  description?: string | null;
  unit?: string;
  quantity: number;
  unitPrice: number;
  discountType?: 'NONE' | 'PERCENT' | 'AMOUNT';
  discountRate?: number | null;
  discountAmount?: number | null;
  taxRate?: number | null;
}

export interface CalculationInput {
  items: CalculationItemInput[];
  taxMode: 'EXCLUSIVE' | 'INCLUSIVE';
  discountType: 'NONE' | 'PERCENT' | 'AMOUNT';
  discountRate?: number | null;
  discountAmount?: number | null;
  shippingAmount?: number | null;
  additionalCharges?: number | null;
  chargesTaxRate?: number | null;
}

export interface CalculatedItem {
  position: number;
  name: string;
  description: string | null;
  unit: string;
  quantity: Decimal;
  unitPrice: Decimal;
  discountType: 'NONE' | 'PERCENT' | 'AMOUNT';
  discountRate: Decimal | null;
  discountAmount: Decimal;
  taxRate: Decimal;
  taxAmount: Decimal;
  lineSubtotal: Decimal;
  lineTotal: Decimal;
}

export interface CalculationResult {
  items: CalculatedItem[];
  subtotal: Decimal;
  discountTotal: Decimal;
  taxTotal: Decimal;
  shippingAmount: Decimal;
  additionalCharges: Decimal;
  chargesTax: Decimal;
  grandTotal: Decimal;
}

/**
 * Prices are stored as Decimal and every intermediate amount is rounded to two
 * decimals, so a saved invoice always matches what the user saw in the form.
 */
export function calculateDocument(input: CalculationInput): CalculationResult {
  const items: CalculatedItem[] = input.items.map((item, index) => {
    const quantity = new Money(item.quantity);
    const unitPrice = new Money(item.unitPrice);
    const discountType = item.discountType ?? 'NONE';
    const gross = quantity.mul(unitPrice);

    let discountAmount = new Money(0);
    if (discountType === 'PERCENT') {
      discountAmount = roundMoney(gross.mul(new Money(item.discountRate ?? 0)).div(100));
    } else if (discountType === 'AMOUNT') {
      discountAmount = roundMoney(Money.min(new Money(item.discountAmount ?? 0), gross));
    }

    const net = gross.minus(discountAmount);
    const taxRate = new Money(item.taxRate ?? 0);
    const taxMultiplier = taxRate.div(100);

    let lineSubtotal: Decimal;
    let taxAmount: Decimal;
    let lineTotal: Decimal;

    if (input.taxMode === 'INCLUSIVE') {
      taxAmount = roundMoney(net.mul(taxMultiplier).div(taxMultiplier.plus(1)));
      lineSubtotal = net.minus(taxAmount);
      lineTotal = net;
    } else {
      taxAmount = roundMoney(net.mul(taxMultiplier));
      lineSubtotal = net;
      lineTotal = net.plus(taxAmount);
    }

    return {
      position: index + 1,
      name: item.name.trim(),
      description: item.description?.trim() || null,
      unit: item.unit?.trim() || 'unit',
      quantity,
      unitPrice,
      discountType,
      discountRate: discountType === 'PERCENT' ? new Money(item.discountRate ?? 0) : null,
      discountAmount,
      taxRate,
      taxAmount,
      lineSubtotal: roundMoney(lineSubtotal),
      lineTotal: roundMoney(lineTotal),
    };
  });

  const subtotal = roundMoney(
    items.reduce((sum, item) => sum.plus(item.lineSubtotal), new Money(0)),
  );
  const taxTotal = roundMoney(items.reduce((sum, item) => sum.plus(item.taxAmount), new Money(0)));

  let discountTotal = new Money(0);
  if (input.discountType === 'PERCENT') {
    discountTotal = roundMoney(subtotal.mul(new Money(input.discountRate ?? 0)).div(100));
  } else if (input.discountType === 'AMOUNT') {
    discountTotal = roundMoney(Money.min(new Money(input.discountAmount ?? 0), subtotal));
  }

  const shippingAmount = roundMoney(new Money(input.shippingAmount ?? 0));
  const additionalCharges = roundMoney(new Money(input.additionalCharges ?? 0));
  const chargesBase = shippingAmount.plus(additionalCharges);
  const chargesTax = roundMoney(chargesBase.mul(new Money(input.chargesTaxRate ?? 0)).div(100));

  const grandTotal = roundMoney(
    subtotal
      .minus(discountTotal)
      .plus(taxTotal)
      .plus(shippingAmount)
      .plus(additionalCharges)
      .plus(chargesTax),
  );

  return {
    items,
    subtotal,
    discountTotal,
    taxTotal,
    shippingAmount,
    additionalCharges,
    chargesTax,
    grandTotal,
  };
}
