import { inflateSync } from 'node:zlib';

/**
 * Test helper: the text PDFKit wrote into a PDF (one entry per `text()` line) and its page
 * count. PDFKit compresses content streams and writes text as hex strings inside TJ arrays.
 */
export function pdfText(pdf: Buffer): { lines: string[]; text: string; pages: number } {
  const source = pdf.toString('latin1');
  const lines: string[] = [];
  const streams = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  for (const match of source.matchAll(streams)) {
    let content: string;
    try {
      content = inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1');
    } catch {
      continue;
    }
    for (const array of content.matchAll(/\[([^\]]*)\]\s*TJ/g)) {
      const hex = [...array[1].matchAll(/<([0-9a-fA-F]*)>/g)].map((part) => part[1]).join('');
      lines.push(Buffer.from(hex, 'hex').toString('latin1'));
    }
  }
  const pages = (source.match(/\/Type \/Page\b/g) ?? []).length;
  return { lines, text: lines.join('\n'), pages };
}
