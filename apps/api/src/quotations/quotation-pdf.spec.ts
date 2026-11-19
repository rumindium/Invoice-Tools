import { deflateSync, inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { QUOTATION_TEMPLATE_KEYS, QUOTATION_TEMPLATES } from '../templates/template-catalog';
import { quotationStatusLabel, renderQuotationPdf } from './quotation-pdf';
import type { QuotationView } from './views';

/** A 4×2 opaque PNG, enough for PDFKit to embed as an image XObject. */
function tinyPng(): string {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (bytes: Buffer) => {
    let c = 0xffffffff;
    for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([length, body, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(4, 0);
  header.writeUInt32BE(2, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const rows = Buffer.concat([0, 1].map(() => Buffer.from([0, ...Array(12).fill(40)])));
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString('base64')}`;
}

function quotation(overrides: Partial<QuotationView> = {}): QuotationView {
  return {
    id: 'q-1',
    number: 'QUO/2026/0007',
    status: 'DRAFT',
    expired: false,
    issueDate: '2026-11-18',
    validUntil: '2026-12-18',
    currency: 'IDR',
    referenceNumber: 'RFQ-1',
    taxMode: 'EXCLUSIVE',
    discountType: 'NONE',
    discountRate: null,
    discountAmount: 0,
    recipient: {
      id: 'c-1',
      name: 'PT Kopi Senja',
      email: 'buy@kopisenja.id',
      address: 'Jl. Braga 12, Bandung',
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
    items: [
      {
        id: 'i-1',
        position: 1,
        catalogItemId: null,
        name: 'Design',
        description: null,
        unit: 'project',
        quantity: 1,
        unitPrice: 1000,
        discountType: 'NONE',
        discountRate: null,
        discountAmount: 0,
        taxRate: 11,
        taxAmount: 110,
        lineTotal: 1110,
      },
    ],
    totals: { subtotal: 1000, discountTotal: 0, taxTotal: 110, grandTotal: 1110 },
    signature: { name: 'Budi', title: 'Director', imageDataUrl: tinyPng() },
    template: { key: 'classic', name: 'Classic', accentColor: '#2563eb', locked: false },
    history: [],
    nextStatuses: ['SENT'],
    goodsReceipt: null,
    canCreateGoodsReceipt: false,
    terminPlan: null,
    invoice: null,
    revision: 1,
    revisions: [],
    canRevise: false,
    revisionBlockedBy: null,
    notes: null,
    terms: null,
    sentAt: null,
    createdAt: '2026-11-18T00:00:00.000Z',
    updatedAt: '2026-11-18T00:00:00.000Z',
    ...overrides,
  };
}

/** Decompressed content streams: what is actually drawn. */
function drawing(pdf: Buffer): string {
  const text = pdf.toString('latin1');
  const streams: string[] = [];
  for (const match of text.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    try {
      streams.push(inflateSync(Buffer.from(match[1]!, 'latin1')).toString('latin1'));
    } catch {
      // image data and other binary streams
    }
  }
  return streams.join('\n');
}

/** Matches the colour set as a fill (scn) or stroke (SCN) in a content stream. */
function colorOperator(hex: string): RegExp {
  const [r, g, b] = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  return new RegExp(`${r} ${g} ${b} (scn|SCN)`.replace(/\./g, '\\.'));
}

function withTemplate(key: string, accentColor: string, overrides: Partial<QuotationView> = {}) {
  const name = QUOTATION_TEMPLATES.find((template) => template.key === key)!.name;
  return quotation({ template: { key, name, accentColor, locked: false }, ...overrides });
}

function inspect(pdf: Buffer) {
  const text = pdf.toString('latin1');
  return {
    pages: (text.match(/\/Type \/Page\b/g) ?? []).length,
    mediaBoxes: [...text.matchAll(/\/MediaBox \[([^\]]+)\]/g)].map((match) => match[1]!.trim()),
    images:
      (text.match(/\/Subtype \/Image/g) ?? []).length -
      (text.match(/\/SMask \d+ 0 R/g) ?? []).length,
  };
}

describe('renderQuotationPdf', () => {
  it('renders a single A4 portrait page with the signature image embedded', async () => {
    const pdf = await renderQuotationPdf(quotation());
    const info = inspect(pdf);

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(info.pages).toBe(1);
    expect(info.mediaBoxes).toEqual(['0 0 595.28 841.89']);
    expect(info.images).toBe(1);
  });

  it('leaves the signature area blank when no image is given', async () => {
    const pdf = await renderQuotationPdf(
      quotation({ signature: { name: null, title: null, imageDataUrl: null } }),
    );

    expect(inspect(pdf).images).toBe(0);
  });

  it('paginates long quotations in portrait without blank pages', async () => {
    const base = quotation().items[0]!;
    const items = Array.from({ length: 60 }, (_, index) => ({
      ...base,
      id: `i-${index}`,
      position: index + 1,
      name: `Line ${index + 1}`,
      description: 'A longer description that wraps onto a second line in the table.',
    }));
    const pdf = await renderQuotationPdf(
      quotation({ items, notes: 'Note '.repeat(80), terms: 'Term '.repeat(80) }),
    );
    const info = inspect(pdf);

    expect(info.pages).toBeGreaterThan(1);
    expect(info.pages).toBeLessThanOrEqual(5);
    expect(new Set(info.mediaBoxes)).toEqual(new Set(['0 0 595.28 841.89']));
    expect(info.images).toBe(1);
  });

  it('labels sent quotations past their validity as expired', () => {
    expect(quotationStatusLabel({ status: 'SENT', expired: true })).toBe('EXPIRED');
    expect(quotationStatusLabel({ status: 'ACCEPTED', expired: false })).toBe('ACCEPTED');
  });
});

describe('quotation templates', () => {
  it.each(QUOTATION_TEMPLATE_KEYS)(
    '%s renders one A4 portrait page with the signature',
    async (key) => {
      const pdf = await renderQuotationPdf(withTemplate(key, '#0f766e'));
      const info = inspect(pdf);

      expect(info.pages).toBe(1);
      expect(info.mediaBoxes).toEqual(['0 0 595.28 841.89']);
      expect(info.images).toBe(1);
      expect(pdf.toString('latin1')).toContain(`template:${key} accent:#0f766e`);
    },
  );

  it.each(QUOTATION_TEMPLATE_KEYS)('%s paginates long quotations in A4 portrait', async (key) => {
    const base = quotation().items[0]!;
    const items = Array.from({ length: 60 }, (_, index) => ({
      ...base,
      id: `i-${index}`,
      position: index + 1,
      name: `Line ${index + 1}`,
      description: 'A longer description that wraps onto a second line in the table.',
      unitPrice: 125_000_000,
      lineTotal: 138_750_000,
    }));
    const pdf = await renderQuotationPdf(
      withTemplate(key, '#2563eb', { items, notes: 'Note '.repeat(80), terms: 'Term '.repeat(80) }),
    );
    const info = inspect(pdf);

    expect(info.pages).toBeGreaterThan(1);
    expect(info.pages).toBeLessThanOrEqual(6);
    expect(new Set(info.mediaBoxes)).toEqual(new Set(['0 0 595.28 841.89']));
    expect(info.images).toBe(1);
  });

  it.each(QUOTATION_TEMPLATE_KEYS)('%s is drawn in the company accent colour', async (key) => {
    const crimson = drawing(await renderQuotationPdf(withTemplate(key, '#dc2626')));
    const emerald = drawing(await renderQuotationPdf(withTemplate(key, '#059669')));

    expect(crimson).toMatch(colorOperator('#dc2626'));
    expect(crimson).not.toMatch(colorOperator('#059669'));
    expect(emerald).toMatch(colorOperator('#059669'));
    expect(emerald).not.toMatch(colorOperator('#dc2626'));
  });

  it('gives every template its own design', async () => {
    const drawings = await Promise.all(
      QUOTATION_TEMPLATE_KEYS.map(async (key) =>
        drawing(await renderQuotationPdf(withTemplate(key, '#4f46e5'))).replace(/[\d.]+/g, '0'),
      ),
    );

    expect(new Set(drawings).size).toBe(QUOTATION_TEMPLATE_KEYS.length);
  });

  it('sets Elegant in a serif typeface and the others in sans-serif', async () => {
    const elegant = (await renderQuotationPdf(withTemplate('elegant', '#9f1239'))).toString(
      'latin1',
    );
    const modern = (await renderQuotationPdf(withTemplate('modern', '#9f1239'))).toString('latin1');

    expect(elegant).toContain('/BaseFont /Times-Roman');
    expect(elegant).not.toContain('/BaseFont /Helvetica');
    expect(modern).toContain('/BaseFont /Helvetica');
    expect(modern).not.toContain('/BaseFont /Times');
  });

  it('falls back to Classic for unknown templates', async () => {
    const pdf = await renderQuotationPdf(
      withTemplate('classic', '#2563eb', {
        template: { key: 'unknown', name: 'Unknown', accentColor: 'red', locked: true },
      }),
    );

    expect(pdf.toString('latin1')).toContain('template:classic accent:#2563eb');
  });
});
