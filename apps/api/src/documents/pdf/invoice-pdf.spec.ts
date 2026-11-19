import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { INVOICE_TEMPLATES, TEMPLATE_KEYS } from '../../templates/template-catalog';
import type { InvoiceItemView, InvoiceView } from '../views';
import { invoiceStatusLabel, renderInvoicePdf } from './invoice-pdf';

function item(index: number, overrides: Partial<InvoiceItemView> = {}): InvoiceItemView {
  return {
    id: `i-${index}`,
    position: index,
    catalogItemId: null,
    name: `Design work ${index}`,
    description: index % 2 ? 'Two revision rounds' : null,
    unit: 'hour',
    quantity: 4,
    unitPrice: 250_000,
    discountType: 'NONE',
    discountRate: null,
    discountAmount: 0,
    taxRate: 11,
    taxAmount: 110_000,
    lineTotal: 1_110_000,
    ...overrides,
  };
}

function invoice(overrides: Partial<InvoiceView> = {}): InvoiceView {
  return {
    id: 'inv-1',
    number: 'INV/2026/00001',
    status: 'ISSUED',
    overdue: false,
    issueDate: '2026-11-18',
    dueDate: '2026-12-02',
    currency: 'IDR',
    referenceNumber: 'PO-77',
    taxMode: 'EXCLUSIVE',
    discountType: 'NONE',
    discountRate: null,
    discountAmount: 0,
    customer: {
      id: 'c-1',
      name: 'PT Kopi Senja',
      email: 'finance@kopisenja.id',
      address: 'Jl. Braga 12, Bandung',
      phone: null,
      contact: { id: null, name: 'Rina', jobTitle: 'Finance', phone: null },
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
      signatoryName: 'Budi Santoso',
      signatoryTitle: 'Director',
    },
    items: [1, 2, 3].map((index) => item(index)),
    totals: {
      subtotal: 3_000_000,
      discountTotal: 0,
      taxTotal: 330_000,
      shippingAmount: 50_000,
      additionalCharges: 0,
      chargesTax: 0,
      grandTotal: 3_380_000,
      amountPaid: 0,
      balanceDue: 3_380_000,
    },
    template: { key: 'classic', name: 'Classic', accentColor: '#2563eb', locked: true },
    history: [],
    followUps: [],
    nextStatuses: ['PAID', 'VOID'],
    flow: null,
    termin: null,
    terminPlan: null,
    notes: 'Thank you for your business.',
    terms: 'Payment within 14 days.',
    issuedAt: '2026-11-18T00:00:00.000Z',
    voidedAt: null,
    voidReason: null,
    createdAt: '2026-11-18T00:00:00.000Z',
    updatedAt: '2026-11-18T00:00:00.000Z',
    revision: 1,
    revisions: [],
    canRevise: true,
    revisionBlockedBy: null,
    ...overrides,
  };
}

function withTemplate(key: string, accentColor: string, overrides: Partial<InvoiceView> = {}) {
  const name = INVOICE_TEMPLATES.find((template) => template.key === key)!.name;
  return invoice({ template: { key, name, accentColor, locked: true }, ...overrides });
}

function streams(pdf: Buffer): string[] {
  const out: string[] = [];
  for (const match of pdf.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    try {
      out.push(inflateSync(Buffer.from(match[1]!, 'latin1')).toString('latin1'));
    } catch {
      // binary streams
    }
  }
  return out;
}

const drawing = (pdf: Buffer) => streams(pdf).join('\n');

/** The printed text: every TJ array's hex runs joined, kerning removed. */
function text(pdf: Buffer): string {
  return [...drawing(pdf).matchAll(/\[(.*?)\] TJ/g)]
    .map((match) =>
      [...match[1]!.matchAll(/<([0-9a-f]*)>/g)]
        .map((hex) => Buffer.from(hex[1]!, 'hex').toString('latin1'))
        .join(''),
    )
    .join('\n');
}

function colorOperator(hex: string): RegExp {
  const [r, g, b] = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  return new RegExp(`${r} ${g} ${b} (scn|SCN)`.replace(/\./g, '\\.'));
}

function pages(pdf: Buffer): string[] {
  return [...pdf.toString('latin1').matchAll(/\/MediaBox \[([^\]]+)\]/g)].map((m) => m[1]!.trim());
}

describe('renderInvoicePdf', () => {
  it.each(TEMPLATE_KEYS)('%s renders a one-page A4 portrait invoice', async (key) => {
    const pdf = await renderInvoicePdf(withTemplate(key, '#0f766e'));
    const printed = text(pdf);

    expect(pages(pdf)).toEqual(['0 0 595.28 841.89']);
    expect(pdf.toString('latin1')).toContain(`template:${key} accent:#0f766e`);
    expect(printed).toMatch(/INVOICE|Invoice/);
    expect(printed).toMatch(/Billed to|BILLED TO/);
    expect(printed).toContain('PT Kopi Senja');
    expect(printed).toMatch(/Due date|DUE DATE/);
    expect(printed).toContain('Shipping');
    expect(printed).toContain('Budi Santoso');
  });

  it.each(TEMPLATE_KEYS)('%s continues long invoices on further A4 pages', async (key) => {
    const items = Array.from({ length: 60 }, (_, index) =>
      item(index + 1, { unitPrice: 125_000_000, lineTotal: 138_750_000 }),
    );
    const pdf = await renderInvoicePdf(
      withTemplate(key, '#2563eb', { items, notes: 'Note '.repeat(80), terms: 'Term '.repeat(80) }),
    );
    const boxes = pages(pdf);

    expect(boxes.length).toBeGreaterThan(1);
    expect(boxes.length).toBeLessThanOrEqual(6);
    expect(new Set(boxes)).toEqual(new Set(['0 0 595.28 841.89']));
  });

  it.each(TEMPLATE_KEYS)('%s is drawn in the company accent colour', async (key) => {
    const crimson = drawing(await renderInvoicePdf(withTemplate(key, '#dc2626')));
    const emerald = drawing(await renderInvoicePdf(withTemplate(key, '#059669')));

    expect(crimson).toMatch(colorOperator('#dc2626'));
    expect(crimson).not.toMatch(colorOperator('#059669'));
    expect(emerald).toMatch(colorOperator('#059669'));
  });

  it('gives every template its own design', async () => {
    const designs = await Promise.all(
      TEMPLATE_KEYS.map(async (key) =>
        drawing(await renderInvoicePdf(withTemplate(key, '#4f46e5'))).replace(/[\d.]+/g, '0'),
      ),
    );
    expect(new Set(designs).size).toBe(TEMPLATE_KEYS.length);
  });

  it('sets Elegant in a serif typeface', async () => {
    const elegant = (await renderInvoicePdf(withTemplate('elegant', '#9f1239'))).toString('latin1');
    expect(elegant).toContain('/BaseFont /Times-Roman');
    expect(elegant).not.toContain('/BaseFont /Helvetica');
  });

  it('prints paid and balance due once money came in', async () => {
    const unpaid = text(await renderInvoicePdf(invoice()));
    const partly = text(
      await renderInvoicePdf(
        invoice({
          status: 'PARTIALLY_PAID',
          totals: { ...invoice().totals, amountPaid: 1_000_000, balanceDue: 2_380_000 },
        }),
      ),
    );

    expect(unpaid).not.toContain('Balance due');
    expect(partly).toContain('Paid');
    expect(partly).toContain('Balance due');
    expect(partly).toMatch(/2\.380\.000/);
  });

  it('cites the source quotation and goods receipt of generated invoices', async () => {
    const printed = text(
      await renderInvoicePdf(
        withTemplate('modern', '#2563eb', {
          flow: {
            quotation: {
              id: 'q',
              number: 'QUO/2026/0009',
              date: '2026-11-01',
              status: 'ACCEPTED',
              expired: false,
              total: 1,
              currency: 'IDR',
            },
            goodsReceipt: {
              id: 'g',
              number: 'GR/2026/0004',
              date: '2026-11-10',
              status: 'RECEIVED',
              acceptedQuantity: 3,
              lineCount: 1,
            },
            invoice: {
              id: 'inv-1',
              number: 'INV/2026/00001',
              date: '',
              status: '',
              total: 1,
              currency: 'IDR',
            },
            events: [],
          },
        }),
      ),
    );
    expect(printed).toContain('QUO/2026/0009');
    expect(printed).toContain('GR/2026/0004');
  });

  it.each(TEMPLATE_KEYS)('%s prints the termin of termin invoices', async (key) => {
    const termin = { planId: 'p-1', sequence: 2, count: 4, percentage: 25, via: null };
    const printed = text(await renderInvoicePdf(withTemplate(key, '#2563eb', { termin })));

    expect(printed).toMatch(/Termin/i);
    expect(printed).toContain('2 of 4 · 25%');
  });

  it('prints the void reason in red and leaves out the signature without a signatory', async () => {
    const voided = await renderInvoicePdf(
      invoice({
        status: 'VOID',
        voidedAt: '2026-11-19T00:00:00.000Z',
        voidReason: 'Billed to the wrong customer',
        company: { ...invoice().company, signatoryName: null },
      }),
    );

    expect(text(voided)).toContain('Billed to the wrong customer');
    expect(drawing(voided)).toMatch(colorOperator('#dc2626'));
    expect(text(voided)).not.toContain('Issued by,');
  });

  it('labels statuses for print', () => {
    expect(invoiceStatusLabel({ status: 'ISSUED', overdue: true })).toBe('OVERDUE');
    expect(invoiceStatusLabel({ status: 'PARTIALLY_PAID', overdue: false })).toBe('PARTIALLY PAID');
  });

  it('keeps the original Classic blue for invoices without a template', async () => {
    const legacy = invoice();
    delete (legacy as Partial<InvoiceView>).template;
    const pdf = await renderInvoicePdf(legacy);
    expect(pdf.toString('latin1')).toContain('template:classic accent:#2563eb');
  });
});
