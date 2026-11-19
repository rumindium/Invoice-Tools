import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Company } from '../database/entities';
import { DocumentType } from '../database/entities/enums';
import { renderInvoicePdf } from '../documents/pdf/invoice-pdf';
import { renderGoodsReceiptPdf } from '../goods-receipts/goods-receipt-pdf';
import { renderQuotationPdf } from '../quotations/quotation-pdf';
import { sampleGoodsReceipt } from '../templates/sample-goods-receipt';
import { sampleInvoice } from '../templates/sample-invoice';
import { sampleQuotation } from '../templates/sample-quotation';
import {
  readTemplateSnapshot,
  templateOfStoredView,
  toTemplateView,
} from '../templates/template-snapshot';
import { invoiceDesignData, resolveFields } from './design-data';
import { pdfFont, renderDesignPdf } from './design-pdf';
import {
  type DesignElement,
  type DesignPayload,
  designPayloadSchema,
  type DesignSnapshot,
  readDesignSnapshot,
} from './design-schema';
import { pdfText } from './pdf-text.test-util';

/** The web app's own starter templates: the contract between the builder and the API. */
interface Presets {
  STARTERS: Array<{ key: string; accent: string }>;
  starterElements(key: string, accent: string): DesignElement[];
}
let presets: Presets;

beforeAll(async () => {
  const path = resolve(__dirname, '../../../web/src/app/pages/template-builder/builder-presets');
  presets = (await import(/* @vite-ignore */ path)) as Presets;
});

const PNG_1PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAQCAIAAACDRijCAAAAHElEQVR4nGPkL8tjoAZgooopowaNGjRq0Ag2CACgNwETgkYNLAAAAABJRU5ErkJggg==';
const SVG_LOGO = `data:image/svg+xml;base64,${Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#0f766e"/></svg>',
).toString('base64')}`;

const company = {
  id: 'company-1',
  legalName: 'Senja Studio',
  displayName: null,
  addressLine1: 'Jl. Sudirman No. 1, Jakarta',
  email: 'hello@senja.studio',
  phone: '+62 21 555 0100',
  website: 'senja.studio',
  taxId: null,
  taxLabel: 'NPWP',
  logoDataUrl: PNG_1PX,
  defaultCurrency: 'IDR',
  defaultTaxRate: 11,
  defaultPaymentTermDays: 14,
  footerText: 'Thank you for your business.',
  signatoryName: 'Ayu Lestari',
  signatoryTitle: 'Founder',
} as unknown as Company;

function design(key: string, overrides: Partial<DesignPayload> = {}): DesignSnapshot {
  const starter = presets.STARTERS.find((entry) => entry.key === key)!;
  return {
    id: `design-${key}`,
    name: `${key} design`,
    kind: 'invoice',
    accentColor: starter.accent,
    page: { size: 'A4', orientation: 'portrait', background: '#ffffff' },
    elements: presets.starterElements(key, starter.accent),
    revision: 3,
    ...overrides,
  };
}

function customTemplate(snapshot: DesignSnapshot) {
  return toTemplateView(
    { key: 'custom', accentColor: snapshot.accentColor, design: snapshot },
    false,
  );
}

const info = { title: 'Test', subject: 'Test', author: 'Senja Studio' };

describe('design format shared with the web app', () => {
  it('accepts every starter template the builder creates', () => {
    for (const starter of presets.STARTERS) {
      const result = designPayloadSchema.safeParse({
        name: starter.key,
        kind: 'invoice',
        accentColor: starter.accent,
        page: { size: 'A4', orientation: 'portrait', background: '#ffffff' },
        elements: presets.starterElements(starter.key, starter.accent),
      });
      expect(result.success, JSON.stringify(result.error?.issues.slice(0, 3))).toBe(true);
    }
  });

  it('rejects malformed designs with readable errors', () => {
    const result = designPayloadSchema.safeParse({
      name: ' ',
      kind: 'invoice',
      accentColor: 'blue',
      page: { size: 'A5', orientation: 'portrait', background: '#fff' },
      elements: [{ type: 'text', id: 'a' }, { type: 'script' }],
    });
    expect(result.success).toBe(false);
    const paths = result.error!.issues.map((issue) => issue.path.join('.'));
    expect(paths).toEqual(
      expect.arrayContaining(['name', 'accentColor', 'page.size', 'page.background']),
    );
  });

  it('rejects duplicate element ids and oversized or foreign images', () => {
    const elements = presets.starterElements('classic', '#2563eb');
    const duplicate = designPayloadSchema.safeParse({
      ...design('classic'),
      elements: [...elements, elements[0]],
    });
    expect(duplicate.success).toBe(false);

    const image = elements.find((element) => element.type === 'image')!;
    for (const src of ['https://example.com/logo.png', 'data:text/html;base64,PGgxPg==']) {
      const result = designPayloadSchema.safeParse({
        ...design('classic'),
        elements: [{ ...image, src }],
      });
      expect(result.success).toBe(false);
    }
  });
});

describe('renderDesignPdf', () => {
  it('draws every starter template with the document data', async () => {
    for (const starter of presets.STARTERS.filter((entry) => entry.key !== 'blank')) {
      const snapshot = design(starter.key);
      const invoice = sampleInvoice(company, customTemplate(snapshot));
      const pdf = await renderInvoicePdf(invoice);
      const { text, pages } = pdfText(pdf);

      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
      expect(pages, starter.key).toBe(1);
      expect(text, starter.key).toContain('PT Kopi Senja Nusantara');
      expect(text, starter.key).toContain('Brand identity design');
      expect(text, starter.key).toContain('INV/SAMPLE/0001');
      expect(text, starter.key).not.toContain('{{');
      expect(pdf.toString('latin1')).toContain(`design:design-${starter.key}`);
    }
  });

  it('continues a long items table on new pages and moves the totals after it', async () => {
    const snapshot = design('classic');
    const invoice = sampleInvoice(company, customTemplate(snapshot));
    invoice.items = Array.from({ length: 45 }, (_, index) => ({
      ...invoice.items[index % invoice.items.length],
      id: `line-${index}`,
      position: index + 1,
      name: `Service line ${index + 1}`,
    }));
    const { text, pages, lines } = pdfText(await renderInvoicePdf(invoice));

    expect(pages).toBeGreaterThanOrEqual(2);
    // The header repeats on every page the table reaches (the totals may need a page of their own).
    const headers = lines.filter((line) => line === 'DESCRIPTION').length;
    expect(headers).toBeGreaterThanOrEqual(2);
    expect(headers).toBeGreaterThanOrEqual(pages - 1);
    expect(text).toContain('Service line 45');
    // Footer repeats on every page; totals appear once, after the last row.
    expect(lines.filter((line) => line.includes('Senja Studio · Jl. Sudirman')).length).toBe(pages);
    expect(lines.indexOf('Balance due')).toBeGreaterThan(lines.indexOf('Service line 45'));
  });

  it('renders quotations and goods receipts with their own data', async () => {
    const quotationDesign = design('modern', { kind: 'quotation' });
    const quotation = sampleQuotation(company, customTemplate(quotationDesign));
    const quotationText = pdfText(await renderQuotationPdf(quotation)).text;
    expect(quotationText).toContain('QUOTATION');
    expect(quotationText).toContain(quotation.recipient.name);

    const receiptDesign = design('minimal', { kind: 'goods-receipt' });
    const receipt = sampleGoodsReceipt(company, customTemplate(receiptDesign));
    const receiptText = pdfText(await renderGoodsReceiptPdf(receipt)).text;
    expect(receiptText).toContain('GOODS RECEIPT');
    expect(receiptText).toContain(receipt.lines[0].name);
    expect(receiptText).toContain('accepted');
  });

  it('draws PNG and SVG images, and skips unreadable ones without failing', async () => {
    const image = (src: string | null, role: 'logo' | 'image' = 'image'): DesignElement => ({
      id: `image-${role}-${src?.slice(11, 15)}`,
      type: 'image',
      name: 'Image',
      role,
      src,
      fit: 'contain',
      radius: 8,
      x: 40,
      y: 40,
      width: 120,
      height: 60,
      rotation: 15,
      opacity: 0.8,
      locked: false,
      hidden: false,
      groupId: null,
    });
    const data = invoiceDesignData(sampleInvoice(company, customTemplate(design('blank'))));
    for (const elements of [
      [image(PNG_1PX)],
      [image(SVG_LOGO)],
      [image(null, 'logo')],
      [image('data:image/png;base64,bm90IGFuIGltYWdl')],
    ]) {
      const pdf = await renderDesignPdf({ page: design('blank').page, elements }, data, info);
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    }
  });

  it('stamps drafts and voided documents', async () => {
    const snapshot = design('minimal');
    const invoice = { ...sampleInvoice(company, customTemplate(snapshot)), status: 'DRAFT' };
    expect(pdfText(await renderInvoicePdf(invoice)).lines).toContain('DRAFT');
    const paid = { ...invoice, status: 'PAID' };
    expect(pdfText(await renderInvoicePdf(paid)).lines).not.toContain('DRAFT');
  });

  it('sizes landscape and Letter pages', async () => {
    const snapshot = design('classic', {
      page: { size: 'Letter', orientation: 'landscape', background: '#fef3c7' },
    });
    const pdf = await renderDesignPdf(
      snapshot,
      invoiceDesignData(sampleInvoice(company, customTemplate(snapshot))),
      info,
    );
    // 1056 × 816 px = 792 × 612 pt
    expect(pdf.toString('latin1')).toMatch(/\/MediaBox \[0 0 792 612\]/);
  });

  it('maps builder fonts onto the standard PDF fonts', () => {
    expect(pdfFont('plex', false, false)).toBe('Helvetica');
    expect(pdfFont('helvetica', true, true)).toBe('Helvetica-BoldOblique');
    expect(pdfFont('georgia', true, false)).toBe('Times-Bold');
    expect(pdfFont('script', false, false)).toBe('Times-Italic');
    expect(pdfFont('mono', false, true)).toBe('Courier-Oblique');
  });
});

describe('custom template snapshots', () => {
  it('round-trips a design through a document snapshot and keeps it when locked', () => {
    const snapshot = design('elegant');
    const stored = {
      templateId: 't1',
      key: 'custom',
      name: 'x',
      accentColor: '#8a6d3b',
      design: snapshot,
    };
    const read = readTemplateSnapshot(JSON.parse(JSON.stringify(stored)), DocumentType.INVOICE);
    expect(read?.key).toBe('custom');
    expect(read?.design?.elements).toHaveLength(snapshot.elements.length);

    const view = templateOfStoredView(stored, DocumentType.INVOICE);
    expect(view).toMatchObject({ key: 'custom', name: 'elegant design', locked: true });
    expect(view.design?.id).toBe('design-elegant');
  });

  it('falls back to the legacy look when a stored design is unusable', () => {
    const broken = { key: 'custom', accentColor: '#2563eb', design: { elements: 'nope' } };
    expect(readTemplateSnapshot(broken)).toBeNull();
    expect(templateOfStoredView(broken).key).toBe('classic');
    expect(readDesignSnapshot(null)).toBeNull();
  });

  it('fills known fields and leaves unknown ones visible', () => {
    const data = invoiceDesignData(sampleInvoice(company, customTemplate(design('blank'))));
    expect(resolveFields('{{company.name}} — {{ customer.name }}', data)).toBe(
      'Senja Studio — PT Kopi Senja Nusantara',
    );
    expect(resolveFields('{{unknown.field}}', data)).toBe('{{unknown.field}}');
  });
});
