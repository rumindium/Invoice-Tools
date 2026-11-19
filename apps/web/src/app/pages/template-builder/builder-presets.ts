import {
  createImage,
  createLine,
  createShape,
  createTable,
  createText,
  createTotals,
  DesignElement,
  PageSettings,
  ShapeKind,
  uid,
} from './builder.model';

/**
 * Things the side panels can insert: a preset key plus optional data (an image data URL or a
 * field token). Presets are built at the origin; the store moves them to the drop point.
 */
export interface InsertRequest {
  preset: string;
  data?: string;
}

export const INSERT_MIME = 'application/x-rinv-insert';

function group<T extends DesignElement>(elements: T[]): T[] {
  const groupId = uid('grp');
  return elements.map((element) => ({ ...element, groupId }));
}

const SHAPE_PRESETS: Record<string, ShapeKind> = {
  rect: 'rect',
  'rect-rounded': 'rect',
  'rect-outline': 'rect',
  ellipse: 'ellipse',
  'ellipse-outline': 'ellipse',
  triangle: 'triangle',
  diamond: 'diamond',
  star: 'star',
  hexagon: 'hexagon',
  arrow: 'arrow',
  chevron: 'chevron',
};

/** Builds the elements for a preset, positioned at (0, 0). */
export function buildPreset(request: InsertRequest, accent: string): DesignElement[] {
  const { preset, data } = request;

  if (preset in SHAPE_PRESETS) {
    const outline = preset.endsWith('-outline');
    const square = ['ellipse', 'ellipse-outline', 'star', 'hexagon', 'diamond', 'triangle'];
    return [
      createShape(
        SHAPE_PRESETS[preset],
        { width: 140, height: square.includes(preset) ? 140 : 100 },
        {
          fill: outline ? null : accent,
          stroke: outline ? accent : null,
          strokeWidth: outline ? 3 : 0,
          radius: preset === 'rect-rounded' ? 18 : 0,
        },
      ),
    ];
  }

  switch (preset) {
    case 'heading':
      return [
        createText('Add a heading', { width: 420 }, { fontSize: 36, fontWeight: 700 }, 'Heading'),
      ];
    case 'subheading':
      return [
        createText(
          'Add a subheading',
          { width: 320 },
          { fontSize: 22, fontWeight: 600 },
          'Subheading',
        ),
      ];
    case 'body':
      return [
        createText(
          'Add a little bit of body text',
          { width: 280 },
          { fontSize: 13, color: '#374151' },
          'Body text',
        ),
      ];
    case 'caption':
      return [
        createText(
          'SMALL LABEL',
          { width: 160 },
          { fontSize: 9, fontWeight: 700, letterSpacing: 1.6, color: accent },
          'Label',
        ),
      ];
    case 'title':
      return [
        createText(
          '{{document.title}}',
          { width: 340 },
          { fontSize: 34, fontWeight: 800, uppercase: true, letterSpacing: 2, color: accent },
          'Document title',
        ),
      ];
    case 'field':
      return [
        createText(`{{${data ?? 'company.name'}}}`, { width: 240 }, { fontSize: 13 }, 'Field'),
      ];
    case 'combo-bill-to':
      return group([
        createText(
          'BILL TO',
          { width: 280 },
          { fontSize: 9, fontWeight: 700, letterSpacing: 1.6, color: accent },
          'Bill to label',
        ),
        createText(
          '{{customer.name}}',
          { y: 18, width: 280 },
          { fontSize: 14, fontWeight: 700 },
          'Customer name',
        ),
        createText(
          '{{customer.address}}\n{{customer.phone}}\n{{customer.email}}',
          { y: 40, width: 280, height: 46 },
          { fontSize: 10.5, color: '#4b5563', lineHeight: 1.45 },
          'Customer details',
        ),
      ]);
    case 'combo-meta':
      return group([
        createText(
          'Number\nIssue date\nDue date\nReference',
          { width: 110, height: 70 },
          { fontSize: 10.5, color: '#6b7280', lineHeight: 1.65 },
          'Detail labels',
        ),
        createText(
          '{{document.number}}\n{{document.date}}\n{{document.dueDate}}\n{{document.reference}}',
          { x: 110, width: 170, height: 70 },
          { fontSize: 10.5, fontWeight: 600, lineHeight: 1.65, align: 'right' },
          'Detail values',
        ),
      ]);
    case 'combo-thanks':
      return group([
        createText(
          'Thank you for your business!',
          { width: 360 },
          { fontSize: 22, fontWeight: 700, fontFamily: 'georgia', italic: true, color: accent },
          'Thank you',
        ),
        createText(
          'We appreciate your trust. Questions about this document? Reply to {{company.email}}.',
          { y: 38, width: 360, height: 34 },
          { fontSize: 10.5, color: '#4b5563' },
          'Thank you note',
        ),
      ]);
    case 'combo-payment':
      return group([
        createText(
          'PAYMENT DETAILS',
          { width: 300 },
          { fontSize: 9, fontWeight: 700, letterSpacing: 1.6, color: accent },
          'Payment label',
        ),
        createText(
          '{{document.terms}}',
          { y: 18, width: 300, height: 32 },
          { fontSize: 10.5, color: '#374151' },
          'Payment terms',
        ),
      ]);
    case 'combo-notes':
      return group([
        createText(
          'NOTES',
          { width: 300 },
          { fontSize: 9, fontWeight: 700, letterSpacing: 1.6, color: accent },
          'Notes label',
        ),
        createText(
          '{{document.notes}}',
          { y: 18, width: 300, height: 32 },
          { fontSize: 10.5, color: '#374151' },
          'Notes',
        ),
      ]);
    case 'combo-footer':
      return group([
        createLine({ width: 714 }, { stroke: '#e5e7eb', strokeWidth: 1 }, 'Footer rule'),
        createText(
          '{{company.name}} · {{company.address}} · {{company.phone}}',
          { y: 12, width: 714 },
          { fontSize: 9, color: '#6b7280', align: 'center' },
          'Footer',
        ),
      ]);
    case 'line':
      return [createLine({ width: 300 }, { strokeWidth: 2 })];
    case 'line-thick':
      return [createLine({ width: 300 }, { strokeWidth: 6, stroke: accent }, 'Thick line')];
    case 'line-dashed':
      return [createLine({ width: 300 }, { strokeWidth: 2, dash: 'dashed' }, 'Dashed line')];
    case 'line-dotted':
      return [createLine({ width: 300 }, { strokeWidth: 3, dash: 'dotted' }, 'Dotted line')];
    case 'table':
      return [createTable(accent, {})];
    case 'totals':
      return [createTotals(accent, {})];
    case 'logo':
      return [createImage('logo', null, { width: 140, height: 70 })];
    case 'image':
      return [createImage('image', data ?? null, { width: 240, height: 160 })];
    case 'signature':
      return [createImage('signature', data ?? null, { width: 200, height: 70 })];
    case 'signature-block':
      return group([
        createImage('signature', data ?? null, { x: 20, width: 180, height: 60 }, 'Signature'),
        createLine({ y: 66, width: 220 }, { stroke: '#9ca3af', strokeWidth: 1 }, 'Signature line'),
        createText(
          '{{signatory.name}}',
          { y: 74, width: 220 },
          { fontSize: 11.5, fontWeight: 700, align: 'center' },
          'Signatory name',
        ),
        createText(
          '{{signatory.title}}',
          { y: 92, width: 220 },
          { fontSize: 10, color: '#6b7280', align: 'center' },
          'Signatory title',
        ),
      ]);
    default:
      return [];
  }
}

/* ----------------------------------------------------------------------------------------------
 * Starter templates
 * -------------------------------------------------------------------------------------------- */

export interface StarterTemplate {
  key: string;
  name: string;
  description: string;
  accent: string;
}

export const STARTERS: StarterTemplate[] = [
  {
    key: 'classic',
    name: 'Classic',
    description: 'Balanced letterhead, clear table',
    accent: '#2563eb',
  },
  {
    key: 'modern',
    name: 'Modern band',
    description: 'Colour band and card blocks',
    accent: '#4f46e5',
  },
  { key: 'minimal', name: 'Minimal', description: 'Quiet type, hairline rules', accent: '#111827' },
  { key: 'elegant', name: 'Elegant', description: 'Centred serif letterhead', accent: '#8a6d3b' },
  {
    key: 'bold',
    name: 'Bold sidebar',
    description: 'Strong side panel, big total',
    accent: '#0f766e',
  },
  { key: 'blank', name: 'Blank', description: 'Start from an empty page', accent: '#2563eb' },
];

const MUTED = '#6b7280';
const BODY = '#374151';

function at<T extends DesignElement>(elements: T[], dx: number, dy: number): T[] {
  return elements.map((element) => ({ ...element, x: element.x + dx, y: element.y + dy }));
}

function widthOf<T extends DesignElement>(elements: T[], width: number): T[] {
  return elements.map((element) => ({ ...element, width }));
}

function signatureBlock(x: number, y: number, accent: string, script = false): DesignElement[] {
  const elements = at(buildPreset({ preset: 'signature-block' }, accent), x, y);
  if (script) {
    return elements.map((element) =>
      element.type === 'text' && element.text === '{{signatory.name}}'
        ? { ...element, fontFamily: 'palatino', fontWeight: 600 }
        : element,
    );
  }
  return elements;
}

function classic(accent: string): DesignElement[] {
  return [
    createImage('logo', null, { x: 40, y: 40, width: 120, height: 60 }),
    createText(
      '{{company.name}}',
      { x: 40, y: 110, width: 340 },
      { fontSize: 16, fontWeight: 700 },
      'Company name',
    ),
    createText(
      '{{company.address}}\n{{company.phone}} · {{company.email}}',
      { x: 40, y: 134, width: 340, height: 44 },
      { fontSize: 10, color: MUTED, lineHeight: 1.5 },
      'Company details',
    ),
    createText(
      '{{document.title}}',
      { x: 394, y: 36, width: 360 },
      {
        fontSize: 32,
        fontWeight: 800,
        uppercase: true,
        letterSpacing: 2,
        color: accent,
        align: 'right',
      },
      'Document title',
    ),
    ...at(buildPreset({ preset: 'combo-meta' }, accent), 474, 96),
    createLine({ x: 40, y: 200, width: 714 }, { stroke: '#e5e7eb', strokeWidth: 1 }, 'Divider'),
    ...at(buildPreset({ preset: 'combo-bill-to' }, accent), 40, 222),
    createTable(accent, { x: 40, y: 330, width: 714 }),
    createTotals(accent, { x: 474, y: 520, width: 280 }),
    ...at(buildPreset({ preset: 'combo-notes' }, accent), 40, 520),
    ...at(buildPreset({ preset: 'combo-payment' }, accent), 40, 590),
    ...signatureBlock(514, 860, accent),
    ...at(buildPreset({ preset: 'combo-footer' }, accent), 40, 1050),
  ];
}

function modern(accent: string): DesignElement[] {
  return [
    createShape('rect', { x: 0, y: 0, width: 794, height: 176 }, { fill: accent }, 'Header band'),
    {
      ...createShape(
        'ellipse',
        { x: 600, y: -80, width: 280, height: 280 },
        { fill: '#ffffff' },
        'Decoration',
      ),
      opacity: 0.08,
    },
    createShape(
      'rect',
      { x: 40, y: 40, width: 96, height: 96 },
      { fill: '#ffffff', radius: 18 },
      'Logo card',
    ),
    createImage('logo', null, { x: 50, y: 58, width: 76, height: 60 }),
    createText(
      '{{document.title}}',
      { x: 160, y: 46, width: 380 },
      { fontSize: 34, fontWeight: 800, uppercase: true, letterSpacing: 3, color: '#ffffff' },
      'Document title',
    ),
    createText(
      '{{document.number}}',
      { x: 160, y: 98, width: 300 },
      { fontSize: 13, color: '#e0e7ff', fontFamily: 'mono' },
      'Document number',
    ),
    createText(
      '{{company.name}}',
      { x: 454, y: 52, width: 300 },
      { fontSize: 14, fontWeight: 700, color: '#ffffff', align: 'right' },
      'Company name',
    ),
    createText(
      '{{company.address}}\n{{company.phone}}\n{{company.email}}',
      { x: 454, y: 76, width: 300, height: 48 },
      { fontSize: 10, color: '#e0e7ff', align: 'right', lineHeight: 1.5 },
      'Company details',
    ),
    // Key dates and the amount due on the left, the customer card on the right.
    ...(
      [
        ['Issued', 'document.date', 40, 120],
        ['Due', 'document.dueDate', 175, 120],
        ['Amount due', 'document.balance', 310, 170],
      ] as const
    ).flatMap(([label, token, x, width], index) =>
      group([
        createText(
          label.toUpperCase(),
          { x, y: 210, width },
          { fontSize: 9, fontWeight: 700, letterSpacing: 1.4, color: MUTED },
          `${label} label`,
        ),
        createText(
          `{{${token}}}`,
          { x, y: 226, width },
          {
            fontSize: index === 2 ? 16 : 14,
            fontWeight: 700,
            color: index === 2 ? accent : '#111827',
          },
          label,
        ),
      ]),
    ),
    createShape(
      'rect',
      { x: 494, y: 196, width: 260, height: 116 },
      { fill: '#f4f6fb', radius: 14 },
      'Bill to card',
    ),
    ...widthOf(at(buildPreset({ preset: 'combo-bill-to' }, accent), 512, 212), 224),
    createTable(accent, { x: 40, y: 340, width: 714 }, { stripeFill: '#f4f6fb', borders: 'none' }),
    createTotals(accent, { x: 474, y: 530, width: 280 }),
    ...at(buildPreset({ preset: 'combo-payment' }, accent), 40, 530),
    ...at(buildPreset({ preset: 'combo-thanks' }, accent), 40, 620),
    ...signatureBlock(514, 880, accent),
    createShape('rect', { x: 0, y: 1083, width: 794, height: 40 }, { fill: accent }, 'Footer band'),
    createText(
      '{{company.website}}  ·  {{company.email}}  ·  {{company.phone}}',
      { x: 40, y: 1095, width: 714 },
      { fontSize: 9.5, color: '#ffffff', align: 'center' },
      'Footer',
    ),
  ];
}

function minimal(accent: string): DesignElement[] {
  return [
    createText(
      '{{company.name}}',
      { x: 60, y: 60, width: 400 },
      {
        fontSize: 20,
        fontWeight: 600,
        fontFamily: 'helvetica',
        letterSpacing: -0.4,
        color: accent,
      },
      'Company name',
    ),
    createText(
      '{{company.address}} · {{company.email}}',
      { x: 60, y: 90, width: 460 },
      { fontSize: 9.5, color: MUTED, fontFamily: 'helvetica' },
      'Company details',
    ),
    createText(
      '{{document.title}}',
      { x: 534, y: 64, width: 200 },
      {
        fontSize: 11,
        letterSpacing: 4,
        uppercase: true,
        color: MUTED,
        align: 'right',
        fontFamily: 'helvetica',
      },
      'Document title',
    ),
    createText(
      '{{document.number}}',
      { x: 60, y: 170, width: 440 },
      { fontSize: 30, fontWeight: 300, fontFamily: 'helvetica', color: accent },
      'Document number',
    ),
    createLine({ x: 60, y: 228, width: 674 }, { stroke: accent, strokeWidth: 1 }, 'Rule'),
    createText(
      'Billed to\n{{customer.name}}\n{{customer.address}}',
      { x: 60, y: 250, width: 300, height: 60 },
      { fontSize: 10.5, color: BODY, lineHeight: 1.6, fontFamily: 'helvetica' },
      'Billed to',
    ),
    createText(
      'Issued  {{document.date}}\nDue  {{document.dueDate}}\nRef  {{document.reference}}',
      { x: 434, y: 250, width: 300, height: 60 },
      { fontSize: 10.5, color: BODY, lineHeight: 1.6, align: 'right', fontFamily: 'mono' },
      'Details',
    ),
    createTable(
      accent,
      { x: 60, y: 350, width: 674 },
      {
        headerFill: '#ffffff',
        headerText: '#111827',
        stripes: false,
        fontFamily: 'helvetica',
      },
    ),
    createTotals(
      accent,
      { x: 454, y: 540, width: 280 },
      { fontFamily: 'helvetica', accentFill: accent },
    ),
    createText(
      '{{document.terms}}',
      { x: 60, y: 560, width: 320, height: 40 },
      { fontSize: 9.5, color: MUTED, fontFamily: 'helvetica' },
      'Terms',
    ),
    ...signatureBlock(514, 880, accent),
    createText(
      '{{company.footer}}',
      { x: 60, y: 1060, width: 674 },
      { fontSize: 8.5, color: '#9ca3af', align: 'center', fontFamily: 'helvetica' },
      'Footer',
    ),
  ];
}

function elegant(accent: string): DesignElement[] {
  const serif = { fontFamily: 'palatino' };
  return [
    createImage('logo', null, { x: 347, y: 40, width: 100, height: 56 }),
    createText(
      '{{company.name}}',
      { x: 97, y: 104, width: 600 },
      { ...serif, fontSize: 22, fontWeight: 600, align: 'center', letterSpacing: 1 },
      'Company name',
    ),
    createText(
      '{{company.address}}  ·  {{company.phone}}',
      { x: 97, y: 136, width: 600 },
      { ...serif, fontSize: 10, color: MUTED, align: 'center', italic: true },
      'Company details',
    ),
    createLine({ x: 60, y: 168, width: 674 }, { stroke: accent, strokeWidth: 1 }, 'Rule top'),
    createLine({ x: 60, y: 172, width: 674 }, { stroke: accent, strokeWidth: 1 }, 'Rule bottom'),
    createText(
      '{{document.title}}',
      { x: 97, y: 196, width: 600 },
      { ...serif, fontSize: 26, letterSpacing: 8, uppercase: true, align: 'center', color: accent },
      'Document title',
    ),
    createText(
      'No. {{document.number}}  ·  {{document.date}}',
      { x: 97, y: 238, width: 600 },
      { ...serif, fontSize: 11, align: 'center', color: BODY },
      'Number and date',
    ),
    createText(
      'Prepared for',
      { x: 60, y: 290, width: 300 },
      { ...serif, fontSize: 11, italic: true, color: accent },
      'Prepared for label',
    ),
    createText(
      '{{customer.name}}\n{{customer.address}}',
      { x: 60, y: 310, width: 320, height: 40 },
      { ...serif, fontSize: 12, color: '#1f2937', lineHeight: 1.5 },
      'Customer',
    ),
    createText(
      'Due {{document.dueDate}}\nReference {{document.reference}}',
      { x: 434, y: 300, width: 300, height: 40 },
      { ...serif, fontSize: 11, align: 'right', color: BODY, lineHeight: 1.6 },
      'Due and reference',
    ),
    createTable(
      accent,
      { x: 60, y: 380, width: 674 },
      {
        fontFamily: 'georgia',
        headerFill: '#f5efe3',
        headerText: '#3f3a2f',
        stripes: false,
        borders: 'rows',
        borderColor: '#e9dfca',
      },
    ),
    createTotals(accent, { x: 454, y: 570, width: 280 }, { fontFamily: 'georgia' }),
    createText(
      '{{document.terms}}',
      { x: 60, y: 580, width: 330, height: 40 },
      { ...serif, fontSize: 10.5, italic: true, color: BODY },
      'Terms',
    ),
    ...signatureBlock(514, 880, accent, true),
    createLine({ x: 60, y: 1046, width: 674 }, { stroke: accent, strokeWidth: 1 }, 'Footer rule'),
    createText(
      '{{company.footer}}',
      { x: 60, y: 1058, width: 674 },
      { ...serif, fontSize: 9, italic: true, color: MUTED, align: 'center' },
      'Footer',
    ),
  ];
}

function bold(accent: string): DesignElement[] {
  const white = { color: '#ffffff' };
  return [
    createShape('rect', { x: 0, y: 0, width: 240, height: 1123 }, { fill: accent }, 'Sidebar'),
    createShape(
      'rect',
      { x: 32, y: 40, width: 176, height: 88 },
      { fill: '#ffffff', radius: 14 },
      'Logo card',
    ),
    createImage('logo', null, { x: 44, y: 52, width: 152, height: 64 }),
    createText(
      '{{company.name}}',
      { x: 32, y: 156, width: 176 },
      { ...white, fontSize: 14, fontWeight: 700 },
      'Company name',
    ),
    createText(
      '{{company.address}}\n\n{{company.phone}}\n{{company.email}}\n{{company.website}}',
      { x: 32, y: 180, width: 176, height: 110 },
      { ...white, fontSize: 9.5, lineHeight: 1.5 },
      'Company details',
    ),
    createText(
      'BILL TO',
      { x: 32, y: 330, width: 176 },
      { ...white, fontSize: 9, fontWeight: 700, letterSpacing: 1.6 },
      'Bill to label',
    ),
    createText(
      '{{customer.name}}',
      { x: 32, y: 348, width: 176 },
      { ...white, fontSize: 13, fontWeight: 700 },
      'Customer name',
    ),
    createText(
      '{{customer.address}}\n{{customer.phone}}',
      { x: 32, y: 392, width: 176, height: 60 },
      { ...white, fontSize: 9.5, lineHeight: 1.5 },
      'Customer details',
    ),
    createText(
      '{{document.title}}',
      { x: 272, y: 40, width: 482 },
      {
        fontSize: 52,
        fontWeight: 800,
        fontFamily: 'display',
        uppercase: true,
        color: '#111827',
        letterSpacing: 1,
      },
      'Document title',
    ),
    ...at(buildPreset({ preset: 'combo-meta' }, accent), 272, 124).map((element) =>
      element.name === 'Detail values' ? { ...element, width: 140 } : element,
    ),
    createText(
      'AMOUNT DUE',
      { x: 554, y: 126, width: 200 },
      { fontSize: 9, fontWeight: 700, letterSpacing: 1.6, color: MUTED, align: 'right' },
      'Amount due label',
    ),
    createText(
      '{{document.balance}}',
      { x: 554, y: 144, width: 200 },
      { fontSize: 18, fontWeight: 800, color: accent, align: 'right' },
      'Amount due',
    ),
    createTable(accent, { x: 272, y: 240, width: 482 }, { headerFill: '#111827' }),
    createTotals(accent, { x: 474, y: 430, width: 280 }),
    ...at(buildPreset({ preset: 'combo-payment' }, accent), 272, 620),
    ...signatureBlock(534, 880, accent),
  ];
}

export function starterElements(key: string, accent: string): DesignElement[] {
  switch (key) {
    case 'classic':
      return classic(accent);
    case 'modern':
      return modern(accent);
    case 'minimal':
      return minimal(accent);
    case 'elegant':
      return elegant(accent);
    case 'bold':
      return bold(accent);
    default:
      return [];
  }
}

export function starterPage(): PageSettings {
  return { size: 'A4', orientation: 'portrait', background: '#ffffff' };
}
