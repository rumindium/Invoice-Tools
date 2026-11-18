import PDFDocument from 'pdfkit';
import type { InvoiceView } from '../views';

const PAGE_MARGIN = 48;
const ACCENT = '#2563eb';
const INK = '#111827';
const MUTED = '#5b6474';
const FAINT = '#8b93a1';
const LINE = '#e5e7eb';
const SOFT = '#f3f4f6';

const PAGE_WIDTH = 595.28;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const BOTTOM_LIMIT = 760;

function formatMoney(value: number, currency: string): string {
  const formatted = new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);

  return `${currency} ${formatted}`;
}

function formatDate(value: string | null): string {
  if (!value) return '—';

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function statusLabel(invoice: InvoiceView): string {
  if (invoice.overdue) return 'OVERDUE';
  if (invoice.status === 'DRAFT') return 'DRAFT';
  return invoice.status.replace(/_/g, ' ');
}

function decodeLogo(dataUrl: string | null): Buffer | null {
  if (!dataUrl?.startsWith('data:')) return null;

  const match = /^data:(image\/(?:png|jpe?g));base64,(.+)$/i.exec(dataUrl);
  if (!match?.[2]) return null;

  try {
    return Buffer.from(match[2], 'base64');
  } catch {
    return null;
  }
}

export function renderInvoicePdf(invoice: InvoiceView): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margin: PAGE_MARGIN,
    info: {
      Title: `Invoice ${invoice.number ?? ''}`.trim(),
      Author: invoice.company.name,
      Subject: `Invoice for ${invoice.customer.name}`,
      Creator: 'Rumindium Invoice',
    },
  });

  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));

  const completed = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  drawInvoice(doc, invoice);
  doc.end();

  return completed;
}

function drawInvoice(doc: PDFKit.PDFDocument, invoice: InvoiceView): void {
  const logo = decodeLogo(invoice.company.logoDataUrl);
  let headerTextLeft = PAGE_MARGIN;

  if (logo) {
    try {
      doc.image(logo, PAGE_MARGIN, PAGE_MARGIN, { fit: [44, 44] });
      headerTextLeft = PAGE_MARGIN + 56;
    } catch {
      headerTextLeft = PAGE_MARGIN;
    }
  }

  doc
    .fillColor(INK)
    .font('Helvetica-Bold')
    .fontSize(15)
    .text(invoice.company.name, headerTextLeft, PAGE_MARGIN, { width: 250 });

  doc.font('Helvetica').fontSize(8.5).fillColor(MUTED);
  const companyLines = [
    invoice.company.address,
    [invoice.company.phone, invoice.company.email].filter(Boolean).join(' · ') || null,
    invoice.company.taxId ? `Tax ID ${invoice.company.taxId}` : null,
  ].filter((line): line is string => Boolean(line));

  doc.text(companyLines.join('\n'), headerTextLeft, PAGE_MARGIN + 21, { width: 250 });

  doc
    .font('Helvetica-Bold')
    .fontSize(24)
    .fillColor(ACCENT)
    .text('INVOICE', PAGE_MARGIN, PAGE_MARGIN - 4, { width: CONTENT_WIDTH, align: 'right' });

  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(MUTED)
    .text(invoice.number ?? 'Draft', PAGE_MARGIN, PAGE_MARGIN + 26, {
      width: CONTENT_WIDTH,
      align: 'right',
    })
    .text(statusLabel(invoice), PAGE_MARGIN, PAGE_MARGIN + 39, {
      width: CONTENT_WIDTH,
      align: 'right',
    });

  let top = PAGE_MARGIN + 78;
  doc
    .moveTo(PAGE_MARGIN, top)
    .lineTo(PAGE_MARGIN + CONTENT_WIDTH, top)
    .strokeColor(LINE)
    .stroke();

  top += 16;
  const columnWidth = (CONTENT_WIDTH - 24) / 2;

  doc.font('Helvetica-Bold').fontSize(8).fillColor(FAINT).text('BILLED TO', PAGE_MARGIN, top);
  doc
    .font('Helvetica-Bold')
    .fontSize(10.5)
    .fillColor(INK)
    .text(invoice.customer.name, PAGE_MARGIN, top + 13, { width: columnWidth });

  doc.font('Helvetica').fontSize(8.5).fillColor(MUTED);
  const contact = invoice.customer.contact;
  const contactLine = contact
    ? `Attn. ${contact.name}${contact.jobTitle ? ` · ${contact.jobTitle}` : ''}${
        contact.phone ? ` · ${contact.phone}` : ''
      }`
    : null;
  const customerLines = [
    contactLine,
    invoice.customer.address,
    invoice.customer.email,
    invoice.customer.phone,
  ].filter((line): line is string => Boolean(line));
  doc.text(customerLines.join('\n'), PAGE_MARGIN, top + 28, { width: columnWidth });

  const detailsLeft = PAGE_MARGIN + columnWidth + 24;
  const detailRows: Array<[string, string]> = [
    ['Invoice date', formatDate(invoice.issueDate)],
    ['Due date', formatDate(invoice.dueDate)],
  ];

  if (invoice.referenceNumber) {
    detailRows.push(['Reference', invoice.referenceNumber]);
  }

  let detailY = top;
  for (const [label, value] of detailRows) {
    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor(FAINT)
      .text(label, detailsLeft, detailY, {
        width: columnWidth * 0.45,
      });
    doc
      .font('Helvetica-Bold')
      .fillColor(INK)
      .text(value, detailsLeft + columnWidth * 0.45, detailY, {
        width: columnWidth * 0.55,
        align: 'right',
      });
    detailY += 14;
  }

  const customerBlockHeight = customerLines.length * 11 + 30;
  let cursor = top + Math.max(customerBlockHeight, detailY - top) + 12;

  cursor = drawItemsTable(doc, invoice, cursor);
  cursor = drawTotals(doc, invoice, cursor);

  if (invoice.notes?.trim()) {
    cursor = ensureSpace(doc, cursor, 60);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(FAINT).text('NOTES', PAGE_MARGIN, cursor);
    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor(MUTED)
      .text(invoice.notes.trim(), PAGE_MARGIN, cursor + 13, { width: CONTENT_WIDTH });
    cursor = doc.y + 12;
  }

  if (invoice.terms?.trim()) {
    cursor = ensureSpace(doc, cursor, 50);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(FAINT).text('TERMS', PAGE_MARGIN, cursor);
    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor(MUTED)
      .text(invoice.terms.trim(), PAGE_MARGIN, cursor + 13, { width: CONTENT_WIDTH });
    cursor = doc.y + 12;
  }

  if (invoice.company.signatoryName || invoice.company.footerText) {
    cursor = ensureSpace(doc, cursor, 80);
    const signatureTop = Math.max(cursor + 18, BOTTOM_LIMIT - 90);

    if (invoice.company.signatoryName) {
      const boxWidth = 180;
      const boxLeft = PAGE_MARGIN + CONTENT_WIDTH - boxWidth;

      doc
        .moveTo(boxLeft, signatureTop + 26)
        .lineTo(boxLeft + boxWidth, signatureTop + 26)
        .strokeColor(LINE)
        .stroke();
      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor(INK)
        .text(invoice.company.signatoryName, boxLeft, signatureTop + 32, { width: boxWidth });
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(MUTED)
        .text(
          invoice.company.signatoryTitle ?? 'Authorised signature',
          boxLeft,
          signatureTop + 45,
          {
            width: boxWidth,
          },
        );
    }

    if (invoice.company.footerText) {
      doc
        .font('Helvetica')
        .fontSize(7.5)
        .fillColor(FAINT)
        .text(invoice.company.footerText, PAGE_MARGIN, 800, {
          width: CONTENT_WIDTH,
          align: 'center',
        });
    }
  } else {
    doc
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor(FAINT)
      .text(`Generated with Rumindium Invoice · ${invoice.number ?? 'Draft'}`, PAGE_MARGIN, 800, {
        width: CONTENT_WIDTH,
        align: 'center',
      });
  }
}

function ensureSpace(doc: PDFKit.PDFDocument, cursor: number, needed: number): number {
  if (cursor + needed <= BOTTOM_LIMIT) {
    return cursor;
  }

  doc.addPage();
  return PAGE_MARGIN;
}

function drawItemsTable(doc: PDFKit.PDFDocument, invoice: InvoiceView, startY: number): number {
  const currency = invoice.currency;
  const columns = {
    description: { x: PAGE_MARGIN + 8, width: 210 },
    quantity: { x: PAGE_MARGIN + 226, width: 42, align: 'right' as const },
    price: { x: PAGE_MARGIN + 276, width: 78, align: 'right' as const },
    tax: { x: PAGE_MARGIN + 362, width: 40, align: 'right' as const },
    amount: { x: PAGE_MARGIN + 410, width: 89, align: 'right' as const },
  };

  let cursor = ensureSpace(doc, startY, 60);

  const drawHeader = (top: number): number => {
    doc.rect(PAGE_MARGIN, top, CONTENT_WIDTH, 22).fillColor(SOFT).fill();
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(MUTED);
    doc.text('DESCRIPTION', columns.description.x, top + 7, { width: columns.description.width });
    doc.text('QTY', columns.quantity.x, top + 7, {
      width: columns.quantity.width,
      align: 'right',
    });
    doc.text('UNIT PRICE', columns.price.x, top + 7, {
      width: columns.price.width,
      align: 'right',
    });
    doc.text('TAX', columns.tax.x, top + 7, { width: columns.tax.width, align: 'right' });
    doc.text('AMOUNT', columns.amount.x, top + 7, {
      width: columns.amount.width,
      align: 'right',
    });
    return top + 30;
  };

  cursor = drawHeader(cursor);

  for (const item of invoice.items) {
    const descriptionHeight = doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .heightOfString(item.name, { width: columns.description.width });
    const detailHeight = item.description
      ? doc
          .font('Helvetica')
          .fontSize(7.5)
          .heightOfString(item.description, { width: columns.description.width })
      : 0;
    const rowHeight = Math.max(descriptionHeight + detailHeight + 10, 24);

    if (cursor + rowHeight > BOTTOM_LIMIT) {
      doc.addPage();
      cursor = drawHeader(PAGE_MARGIN);
    }

    doc.font('Helvetica-Bold').fontSize(9).fillColor(INK);
    doc.text(item.name, columns.description.x, cursor, { width: columns.description.width });

    if (item.description) {
      doc
        .font('Helvetica')
        .fontSize(7.5)
        .fillColor(MUTED)
        .text(item.description, columns.description.x, cursor + descriptionHeight + 1, {
          width: columns.description.width,
        });
    }

    doc.font('Helvetica').fontSize(9).fillColor(INK);
    const valueY = cursor + 1;
    doc.text(`${item.quantity}`, columns.quantity.x, valueY, {
      width: columns.quantity.width,
      align: 'right',
    });
    doc.text(formatMoney(item.unitPrice, currency), columns.price.x, valueY, {
      width: columns.price.width,
      align: 'right',
    });
    doc.text(item.taxRate > 0 ? `${item.taxRate}%` : '—', columns.tax.x, valueY, {
      width: columns.tax.width,
      align: 'right',
    });
    doc.text(formatMoney(item.lineTotal, currency), columns.amount.x, valueY, {
      width: columns.amount.width,
      align: 'right',
    });

    cursor += rowHeight;
    doc
      .moveTo(PAGE_MARGIN, cursor - 4)
      .lineTo(PAGE_MARGIN + CONTENT_WIDTH, cursor - 4)
      .strokeColor(LINE)
      .stroke();
  }

  return cursor + 8;
}

function drawTotals(doc: PDFKit.PDFDocument, invoice: InvoiceView, startY: number): number {
  const currency = invoice.currency;
  const rows: Array<[string, number]> = [['Subtotal', invoice.totals.subtotal]];

  if (invoice.totals.discountTotal > 0) {
    rows.push(['Discount', -invoice.totals.discountTotal]);
  }

  if (invoice.totals.taxTotal > 0) {
    rows.push(['Tax', invoice.totals.taxTotal]);
  }

  if (invoice.totals.shippingAmount > 0) {
    rows.push(['Shipping', invoice.totals.shippingAmount]);
  }

  if (invoice.totals.additionalCharges > 0) {
    rows.push(['Additional charges', invoice.totals.additionalCharges]);
  }

  if (invoice.totals.chargesTax > 0) {
    rows.push(['Charges tax', invoice.totals.chargesTax]);
  }

  const boxWidth = 250;
  const boxLeft = PAGE_MARGIN + CONTENT_WIDTH - boxWidth;
  const needed = rows.length * 14 + 70;
  let cursor = ensureSpace(doc, startY + 6, needed);

  for (const [label, value] of rows) {
    doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(label, boxLeft, cursor, {
      width: 140,
    });
    doc
      .font('Helvetica')
      .fillColor(INK)
      .text(formatMoney(value, currency), boxLeft + 140, cursor, {
        width: boxWidth - 140,
        align: 'right',
      });
    cursor += 14;
  }

  cursor += 4;
  doc.rect(boxLeft, cursor, boxWidth, 26).fillColor(ACCENT).fill();
  doc
    .font('Helvetica-Bold')
    .fontSize(9.5)
    .fillColor('#ffffff')
    .text('TOTAL', boxLeft + 10, cursor + 9, { width: 100 });
  doc.text(formatMoney(invoice.totals.grandTotal, currency), boxLeft + 100, cursor + 9, {
    width: boxWidth - 110,
    align: 'right',
  });

  cursor += 34;

  if (invoice.totals.amountPaid > 0) {
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(MUTED)
      .text('Paid', boxLeft, cursor, { width: 140 });
    doc
      .fillColor(INK)
      .text(formatMoney(invoice.totals.amountPaid, currency), boxLeft + 140, cursor, {
        width: boxWidth - 140,
        align: 'right',
      });
    cursor += 14;
    doc.font('Helvetica-Bold').fillColor(INK).text('Balance due', boxLeft, cursor, { width: 140 });
    doc.text(formatMoney(invoice.totals.balanceDue, currency), boxLeft + 140, cursor, {
      width: boxWidth - 140,
      align: 'right',
    });
    cursor += 14;
  }

  return cursor + 10;
}
