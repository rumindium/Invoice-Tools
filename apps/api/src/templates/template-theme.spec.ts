import { describe, expect, it } from 'vitest';
import { DocumentType } from '../database/entities/enums';
import {
  findTemplate,
  GOODS_RECEIPT_TEMPLATES,
  QUOTATION_TEMPLATES,
  TEMPLATE_DOCUMENT_TYPES,
  TEMPLATE_KEYS,
  TEMPLATE_PALETTE,
  templateCatalog,
} from './template-catalog';
import { buildTheme, contrastRatio, isHexColor, normaliseColor } from './template-theme';

describe('buildTheme', () => {
  it('keeps the chosen accent and derives lighter tints from it', () => {
    const theme = buildTheme('#2563EB');

    expect(theme.accent).toBe('#2563eb');
    expect(theme.onAccent).toBe('#ffffff');
    expect(theme.soft).not.toBe(theme.accent);
    expect(contrastRatio(theme.soft, '#ffffff')).toBeLessThan(1.3);
    expect(contrastRatio(theme.tint, '#ffffff')).toBeLessThan(contrastRatio(theme.soft, '#ffffff'));
  });

  it.each([
    '#fde047',
    '#a7f3d0',
    '#ffffff',
    '#000000',
    '#ea580c',
    ...TEMPLATE_PALETTE.map((swatch) => swatch.color),
  ])('keeps text legible for %s', (color) => {
    const theme = buildTheme(color);

    // Accent text on white and text on the accent fill stay readable.
    expect(contrastRatio(theme.accentText, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(theme.onAccent, theme.accent)).toBeGreaterThanOrEqual(3);
  });

  it('uses dark text on light accents', () => {
    expect(buildTheme('#fde047').onAccent).toBe('#111827');
  });

  it('falls back for invalid colours', () => {
    expect(buildTheme('red', '#0f766e').accent).toBe('#0f766e');
    expect(normaliseColor('#ABCDEF', '#000000')).toBe('#abcdef');
    expect(isHexColor('#12345')).toBe(false);
    expect(isHexColor('#12345g')).toBe(false);
    expect(isHexColor('#123456')).toBe(true);
  });
});

describe('template catalog', () => {
  it('offers five distinct quotation templates, each with its own default colour', () => {
    expect(QUOTATION_TEMPLATES).toHaveLength(5);
    expect(new Set(QUOTATION_TEMPLATES.map((template) => template.key)).size).toBe(5);
    expect(new Set(QUOTATION_TEMPLATES.map((template) => template.name)).size).toBe(5);
    expect(new Set(QUOTATION_TEMPLATES.map((template) => template.defaultColor)).size).toBe(5);
    for (const template of QUOTATION_TEMPLATES) {
      expect(isHexColor(template.defaultColor)).toBe(true);
      expect(template.highlights.length).toBeGreaterThan(0);
    }
  });
});

describe('goods receipt template catalog', () => {
  it('offers the same five design families, described for goods receipts', () => {
    expect(GOODS_RECEIPT_TEMPLATES.map((template) => template.key)).toEqual([...TEMPLATE_KEYS]);
    expect(new Set(GOODS_RECEIPT_TEMPLATES.map((template) => template.tagline)).size).toBe(5);
    for (const template of GOODS_RECEIPT_TEMPLATES) {
      const quotation = QUOTATION_TEMPLATES.find((candidate) => candidate.key === template.key)!;
      expect(template.name).toBe(quotation.name);
      expect(template.description).not.toBe(quotation.description);
      expect(isHexColor(template.defaultColor)).toBe(true);
    }
  });

  it('is reachable by URL segment and document type', () => {
    expect(TEMPLATE_DOCUMENT_TYPES['goods-receipt']).toBe(DocumentType.GOODS_RECEIPT);
    expect(templateCatalog(DocumentType.GOODS_RECEIPT)).toBe(GOODS_RECEIPT_TEMPLATES);
    expect(templateCatalog(DocumentType.RECEIPT)).toEqual([]);
    expect(findTemplate('modern', DocumentType.GOODS_RECEIPT).tagline).toBe(
      'Colour band with reference tiles',
    );
    expect(findTemplate('unknown', DocumentType.GOODS_RECEIPT).key).toBe('classic');
  });
});
