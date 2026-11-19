import type { Response } from 'express';

/** Streams a generated PDF as a download (or inline, for previews opened in a tab). */
export function sendPdf(
  response: Response,
  buffer: Buffer,
  filename: string,
  disposition: 'attachment' | 'inline' = 'attachment',
): void {
  response.setHeader('Content-Type', 'application/pdf');
  response.setHeader('Content-Disposition', `${disposition}; filename="${filename}"`);
  response.setHeader('Content-Length', String(buffer.length));
  response.setHeader('Cache-Control', 'no-store');
  response.end(buffer);
}
