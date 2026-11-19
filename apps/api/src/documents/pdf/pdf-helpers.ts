/** Formatting shared by the invoice and quotation PDF renderers. */

export function formatMoney(value: number, currency: string): string {
  const formatted = new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);

  return `${currency} ${formatted}`;
}

export function formatDate(value: string | null): string {
  if (!value) return '—';

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00.000Z`));
}

/** PNG/JPEG bytes from a data URL (company logo, signature), or null for anything else. */
export function decodeImage(dataUrl: string | null): Buffer | null {
  if (!dataUrl?.startsWith('data:')) return null;

  const match = /^data:(image\/(?:png|jpe?g));base64,(.+)$/i.exec(dataUrl);
  if (!match?.[2]) return null;

  try {
    return Buffer.from(match[2], 'base64');
  } catch {
    return null;
  }
}
