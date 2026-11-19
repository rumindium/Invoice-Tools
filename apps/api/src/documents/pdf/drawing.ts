import { decodeImage } from './pdf-helpers';

/**
 * Drawing primitives shared by the templated PDF renderers (quotations, goods receipts):
 * A4 geometry, neutral colours, font sets, rules and the company logo.
 */

export const PAGE_WIDTH = 595.28;
export const PAGE_HEIGHT = 841.89;

export const INK = '#111827';
export const MUTED = '#5b6474';
export const FAINT = '#8b93a1';
export const LINE = '#e5e7eb';
export const SOFT = '#f3f4f6';

export interface Fonts {
  regular: string;
  bold: string;
  italic: string;
}

export const HELVETICA: Fonts = {
  regular: 'Helvetica',
  bold: 'Helvetica-Bold',
  italic: 'Helvetica-Oblique',
};

export const TIMES: Fonts = { regular: 'Times-Roman', bold: 'Times-Bold', italic: 'Times-Italic' };

/** Where content flows on a page; layouts with a sidebar shift it right. */
export interface Frame {
  left: number;
  width: number;
  /** Top of content on continuation pages. */
  top: number;
  /** Content must end above this line. */
  bottom: number;
}

export interface Rule {
  color: string;
  width: number;
}

export function rule(
  doc: PDFKit.PDFDocument,
  x1: number,
  x2: number,
  y: number,
  style: Rule,
): void {
  doc.save().moveTo(x1, y).lineTo(x2, y).lineWidth(style.width).strokeColor(style.color).stroke();
  doc.restore();
}

interface Backdrop {
  padding: number;
  radius: number;
  color: string;
}

/**
 * Draws the company logo into a `size` box, optionally on a rounded backdrop (for logos on
 * colour fills). Returns false, drawing nothing, when there is no readable PNG/JPEG.
 */
export function drawLogo(
  doc: PDFKit.PDFDocument,
  source: { company: { logoDataUrl: string | null } },
  x: number,
  y: number,
  size: number,
  backdrop?: Backdrop,
): boolean {
  const data = decodeImage(source.company.logoDataUrl);
  if (!data) {
    return false;
  }

  let image: unknown;
  try {
    // Opening first means an unreadable file never leaves an empty backdrop behind.
    image = (doc as unknown as { openImage(src: Buffer): unknown }).openImage(data);
  } catch {
    return false;
  }

  if (backdrop) {
    doc
      .save()
      .roundedRect(
        x - backdrop.padding,
        y - backdrop.padding,
        size + backdrop.padding * 2,
        size + backdrop.padding * 2,
        backdrop.radius,
      )
      .fillColor(backdrop.color)
      .fill()
      .restore();
  }
  doc.image(image as Buffer, x, y, { fit: [size, size], align: 'center', valign: 'center' });
  return true;
}

/** Collects a PDFKit document into a buffer. */
export function collect(doc: PDFKit.PDFDocument): Promise<Buffer> {
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  return new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}
