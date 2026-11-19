import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { GOODS_RECEIPT_TEMPLATES, TEMPLATE_KEYS } from '../templates/template-catalog';
import { formatQuantity, renderGoodsReceiptPdf } from './goods-receipt-pdf';
import type { GoodsReceiptLineView, GoodsReceiptView } from './views';

function line(index: number): GoodsReceiptLineView {
  return {
    id: `l-${index}`,
    position: index,
    catalogItemId: null,
    name: `Item ${index}`,
    description: index % 2 ? 'Packed in cartons' : null,
    unit: 'pcs',
    orderedQuantity: 10,
    receivedQuantity: 10,
    rejectedQuantity: 1,
    acceptedQuantity: 9,
    remarks: index % 3 ? null : 'One carton dented',
  };
}

function receipt(
  lines: GoodsReceiptLineView[],
  overrides: Partial<GoodsReceiptView> = {},
): GoodsReceiptView {
  return {
    id: 'g-1',
    number: 'GR/2026/0001',
    status: 'RECEIVED',
    receiptDate: '2026-11-18',
    currency: 'IDR',
    source: {
      quotationId: 'q-1',
      quotationNumber: 'QUO/2026/0001',
      quotationDate: '2026-11-01',
      customerReference: 'PO-77',
    },
    details: {
      deliveryNoteNumber: 'DO-42',
      carrier: 'JNE',
      vehicleNumber: 'B 1234 XYZ',
      receivingLocation: 'Warehouse A',
      deliveredByName: 'Budi',
      receivedByName: 'Rina',
      receivedByTitle: 'Procurement',
      checkedByName: 'Dedi',
    },
    recipient: {
      id: 'c-1',
      name: 'PT Kopi Senja',
      email: null,
      address: 'Bandung',
      phone: null,
      attention: { id: null, name: 'Rina', jobTitle: 'Procurement', phone: null },
    },
    company: {
      id: 'co-1',
      name: 'Rumindium Studio',
      address: 'Jakarta',
      email: null,
      phone: null,
      taxId: null,
      logoDataUrl: null,
      footerText: null,
    },
    lines,
    totals: {
      ordered: lines.length * 10,
      received: lines.length * 10,
      rejected: lines.length,
      accepted: lines.length * 9,
      acceptedValue: 0,
    },
    notes: 'Delivered in 3 boxes.',
    template: { key: 'classic', name: 'Classic', accentColor: '#2563eb', locked: true },
    history: [],
    nextStatuses: ['CANCELLED'],
    invoice: null,
    canCreateInvoice: false,
    canSplitInvoice: false,
    termin: null,
    terminPlan: null,
    invoiceTerminPlan: null,
    revision: 1,
    revisions: [],
    canRevise: false,
    revisionBlockedBy: null,
    receivedAt: null,
    cancelledAt: null,
    cancelReason: null,
    createdAt: '2026-11-18T00:00:00.000Z',
    updatedAt: '2026-11-18T00:00:00.000Z',
    ...overrides,
  };
}

function withTemplate(key: string, accentColor: string, lines = [1, 2, 3].map(line)) {
  const name = GOODS_RECEIPT_TEMPLATES.find((template) => template.key === key)!.name;
  return receipt(lines, { template: { key, name, accentColor, locked: true } });
}

/** Decompressed content streams: what is actually drawn. */
function drawing(pdf: Buffer): string {
  const streams: string[] = [];
  for (const match of pdf.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    try {
      streams.push(inflateSync(Buffer.from(match[1]!, 'latin1')).toString('latin1'));
    } catch {
      // binary streams
    }
  }
  return streams.join('\n');
}

function colorOperator(hex: string): RegExp {
  const [r, g, b] = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  return new RegExp(`${r} ${g} ${b} (scn|SCN)`.replace(/\./g, '\\.'));
}

/** The printed text (PDFKit writes WinAnsi hex strings in TJ arrays). */
function text(pdf: Buffer): string {
  return [...drawing(pdf).matchAll(/\[(.*?)\] TJ/g)]
    .map((match) =>
      [...match[1]!.matchAll(/<([0-9a-f]*)>/g)]
        .map((hex) => Buffer.from(hex[1]!, 'hex').toString('latin1'))
        .join(''),
    )
    .join('\n');
}

function pages(pdf: Buffer): string[] {
  return [...pdf.toString('latin1').matchAll(/\/MediaBox \[([^\]]+)\]/g)].map((m) => m[1]!.trim());
}

describe('renderGoodsReceiptPdf', () => {
  it('renders a one-page A4 portrait goods receipt note', async () => {
    const pdf = await renderGoodsReceiptPdf(receipt([1, 2, 3].map(line)));

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pages(pdf)).toEqual(['0 0 595.28 841.89']);
  });

  it('continues long receipts on further portrait pages', async () => {
    const pdf = await renderGoodsReceiptPdf(
      receipt(Array.from({ length: 40 }, (_, index) => line(index + 1))),
    );
    const boxes = pages(pdf);

    expect(boxes.length).toBeGreaterThan(1);
    expect(new Set(boxes)).toEqual(new Set(['0 0 595.28 841.89']));
  });

  it('prints quantities without trailing zeros', () => {
    expect(formatQuantity(2)).toBe('2');
    expect(formatQuantity(2.5)).toBe('2.5');
    expect(formatQuantity(1250.125)).toBe('1,250.125');
  });
});

describe('goods receipt templates', () => {
  it.each(TEMPLATE_KEYS)('%s renders a one-page A4 portrait goods receipt note', async (key) => {
    const pdf = await renderGoodsReceiptPdf(withTemplate(key, '#0f766e'));

    expect(pages(pdf)).toEqual(['0 0 595.28 841.89']);
    expect(pdf.toString('latin1')).toContain(`template:${key} accent:#0f766e`);
  });

  it.each(TEMPLATE_KEYS)('%s continues long receipts on further A4 pages', async (key) => {
    const lines = Array.from({ length: 45 }, (_, index) => ({
      ...line(index + 1),
      orderedQuantity: 1250.125,
      receivedQuantity: 1250.125,
      remarks: 'Carton 4 of 9 slightly dented, contents checked one by one',
    }));
    const pdf = await renderGoodsReceiptPdf(withTemplate(key, '#2563eb', lines));
    const boxes = pages(pdf);

    expect(boxes.length).toBeGreaterThan(1);
    expect(boxes.length).toBeLessThanOrEqual(6);
    expect(new Set(boxes)).toEqual(new Set(['0 0 595.28 841.89']));
  });

  it.each(TEMPLATE_KEYS)('%s is drawn in the company accent colour', async (key) => {
    const crimson = drawing(await renderGoodsReceiptPdf(withTemplate(key, '#dc2626')));
    const emerald = drawing(await renderGoodsReceiptPdf(withTemplate(key, '#059669')));

    expect(crimson).toMatch(colorOperator('#dc2626'));
    expect(crimson).not.toMatch(colorOperator('#059669'));
    expect(emerald).toMatch(colorOperator('#059669'));
  });

  it('gives every template its own design', async () => {
    const designs = await Promise.all(
      TEMPLATE_KEYS.map(async (key) =>
        drawing(await renderGoodsReceiptPdf(withTemplate(key, '#4f46e5'))).replace(/[\d.]+/g, '0'),
      ),
    );

    expect(new Set(designs).size).toBe(TEMPLATE_KEYS.length);
  });

  it('sets Elegant in a serif typeface', async () => {
    const elegant = (await renderGoodsReceiptPdf(withTemplate('elegant', '#9f1239'))).toString(
      'latin1',
    );
    const bold = (await renderGoodsReceiptPdf(withTemplate('bold', '#9f1239'))).toString('latin1');

    expect(elegant).toContain('/BaseFont /Times-Roman');
    expect(elegant).not.toContain('/BaseFont /Helvetica');
    expect(bold).not.toContain('/BaseFont /Times');
  });

  it('keeps the original Classic blue for receipts without a template', async () => {
    const legacy = receipt([1, 2].map(line));
    delete (legacy as Partial<GoodsReceiptView>).template;
    const pdf = await renderGoodsReceiptPdf(legacy);

    expect(pdf.toString('latin1')).toContain('template:classic accent:#2563eb');
  });

  it.each(TEMPLATE_KEYS)('%s prints the termin of termin receipts on one page', async (key) => {
    const termin = { planId: 'p-1', sequence: 1, count: 3, percentage: 30, via: null };
    const pdf = await renderGoodsReceiptPdf({ ...withTemplate(key, '#2563eb'), termin });

    expect(pages(pdf)).toEqual(['0 0 595.28 841.89']);
    expect(text(pdf)).toContain('1 of 3 · 30%');
    expect(text(await renderGoodsReceiptPdf(withTemplate(key, '#2563eb')))).not.toContain('1 of 3');
  });

  it('prints the cancellation reason on cancelled receipts', async () => {
    const pdf = await renderGoodsReceiptPdf(
      receipt([1].map(line), { status: 'CANCELLED', cancelReason: 'Wrong batch delivered' }),
    );

    expect(drawing(pdf)).toMatch(colorOperator('#dc2626'));
  });
});
