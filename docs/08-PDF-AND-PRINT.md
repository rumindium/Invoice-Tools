# 08 — PDF and Print

> A4 and Letter documents, the single print route, server rendering in Chromium, guest browser print, pagination,
> fonts, watermarks and the parity rules between preview, PDF and stored snapshot.
> Feature ID `F08` · queue: `client + worker` · phase `P1` (browser print), `P2` (server PDF)
> Last updated: November 2026

---

## 1. Overview

There is one document layout. The editor preview, the print route and the server PDF all render the same Angular
component from the same frozen snapshot. A separate server-side HTML template is deliberately not used, because it
would drift from what the user approved.

```text
editor preview ─┐
                ├── same component + same snapshot ──▶ pixels
/print/:token ──┤
                └── Chromium page.pdf() ──▶ stored PDF
```

Guest documents print through the browser dialog. Account documents are rendered by the worker into a stored PDF
that can be downloaded later, unchanged.

---

## 2. Page and output

| Property | Value |
|---|---|
| Default paper | A4, 210 × 297 mm |
| Optional paper | US Letter, 8.5 × 11 in |
| Margins | 18 mm top/bottom, 16 mm left/right |
| Orientation | Portrait only in phase 1 |
| Colour | Full colour; accent used for rules and headings |
| Fonts | Inter (UI/table), Source Serif 4 (document title); self-hosted, embedded via CSS |
| Output | `application/pdf`, one file per issued revision |
| Filename | `INV-2026-0007.pdf` (number with `/` replaced by `-`) |
| Metadata | Title, author (company), subject (document number), creator; no hidden customer data |
| Max pages | 100 |
| Max size | 20 MB |

A4 is the default because the target market is Indonesia. Letter is a per-template option, not a per-document
free-for-all.

---

## 3. What the document contains

| Block | Content |
|---|---|
| Header | Logo, issuer name, address, contact, tax id; document title and number |
| Meta | Issue date, due date or valid until, reference, currency, page x of y |
| Parties | Customer name and billing address; shipping address if different |
| Table | Item, description, quantity, unit, unit price, discount, tax, line total |
| Totals | Subtotal, discount, tax grouped by rate, shipping, additional charges, grand total |
| Words | Amount in words in the document language |
| Footer | Terms, bank details (up to five), signatory name and title, signature line |
| Watermark | `DRAFT` for a draft preview; `VOID` for a voided document; none for issued |

Delivery orders print quantities and descriptions; prices are hidden by default (`showPricesOnDelivery = false`)
and can be enabled per template. A receipt prints the payment amount, the invoice number it settles and the payment
method.

---

## 4. The print route

```text
GET /print/:token
  → client-rendered Angular route (RenderMode.Client)
  → fetches GET /api/v1/print/:token
  → renders the frozen snapshot
  → sets document.documentElement.dataset.printReady = "true"
```

Rules:

- The token is 32 random bytes, stored as SHA-256, expires in 5 minutes and is bound to one document and revision.
- The print route has no session cookie, no navigation, no editor, no links and no analytics.
- `Cache-Control: no-store`, `X-Robots-Tag: noindex`, `Referrer-Policy: no-referrer`.
- CSP allows only self-hosted styles, fonts and images; no external network.
- The payload contains presentation fields only: issuer, customer, template, lines, totals, words, currency and
  logo URL. No cost, internal notes, workspace id or other documents.
- The logo is served by `GET /print/:token/logo`, which validates the same token and streams the asset.
- A token for a voided document renders the voided copy with the watermark.

The worker opens exactly `PUBLIC_ORIGIN/print/<token>` and aborts any request to another origin.

---

## 5. Worker rendering

```text
claim job (FOR UPDATE SKIP LOCKED)
  → mint token
  → launch/reuse Chromium
  → page.goto(printUrl, { waitUntil: "networkidle" })
  → wait for [data-print-ready="true"] (20 s)
  → page.pdf({ format, printBackground: true, preferCSSPageSize: true, margin: 0 })
  → verify page count ≤ 100 and bytes ≤ 20 MB
  → store documents/{workspaceId}/{documentId}/r{revision}.pdf
  → attach asset to the document; mark job succeeded
  → revoke token
```

| Property | Value |
|---|---|
| Concurrency | 2 per worker |
| Timeout | 120 s per job |
| Browser | Chromium from the Playwright image, non-root, read-only filesystem |
| Retries | 3, exponential backoff (5 s, 25 s, 125 s) |
| Network | Only `PUBLIC_ORIGIN`; other requests aborted |
| Memory | 1 GB container budget |
| Failure | Job `FAILED` with a safe reason; the document stays issued and can retry |

A worker crash leaves the job locked until `JOB_LOCK_TIMEOUT_MS`, then it returns to the queue. Issuing never waits
for the PDF.

---

## 6. Pagination and long content

| Rule | Implementation |
|---|---|
| Repeated header | `<thead>` with `display: table-header-group` |
| Row integrity | `tr { break-inside: avoid; }` |
| Totals block | `break-inside: avoid;` with the last rows |
| Long description | Wraps inside the cell; may span pages |
| Footer | Fixed page footer with page x of y via CSS counters |
| Widows/orphans | `orphans: 3; widows: 3;` |
| Empty optional rows | Omitted, not printed as blank |
| 200 lines | Paginates; page count verified in tests |

If the content exceeds 100 pages, the API rejects the PDF request with `422 PDF_TOO_LARGE` and asks the user to
split the document. It never truncates silently.

---

## 7. Fonts and characters

- Inter and Source Serif 4 are bundled with a Latin subset that covers Indonesian and English.
- `font-display: block` in print, so a fallback never changes the layout.
- Currency symbols (Rp, $, €, ¥) and the multiplication sign are covered by the subset.
- A character outside the subset renders with a bundled fallback; the build test includes Indonesian diacritics
  and common punctuation.
- No external font CDN, so the PDF is reproducible offline.

---

## 8. Guest printing

- Guest documents never call the PDF API.
- **Print / Save as PDF** opens the browser print dialog on the same preview component with print CSS.
- The dialog is labelled honestly: the browser decides the paper size and headers.
- The preview shows a `DRAFT` watermark and the local reference, so a guest PDF cannot be mistaken for an issued
  document.
- After saving to an account and issuing, the official number and server PDF replace the local version.

---

## 9. Storage and download

| Artefact | Key | Retention |
|---|---|---|
| Issued PDF | `documents/{workspaceId}/{documentId}/r{revision}.pdf` | Until the document is deleted |
| Voided PDF | `documents/{workspaceId}/{documentId}/r{revision}-void.pdf` | Same as the document; original retained |
| Draft preview | `previews/{workspaceId}/{documentId}/{timestamp}.pdf` | 24 hours |
| Receipt PDF | Same as issued, under the receipt document id | Same as the receipt |

`GET …/documents/:id/pdf` returns `302` to a signed URL valid 5 minutes when the artefact exists, `202` with the
running job when it does not, and `404` when no PDF was ever requested. The local storage driver streams the file
instead of redirecting.

---

## 10. Parity and verification

| Check | Method |
|---|---|
| Preview = PDF | Screenshot the print route at A4; compare with the PDF page at 0.1% pixel tolerance |
| Totals = snapshot | Extract text; assert number, customer, grand total and amount in words |
| Pagination | 1, 40 and 200 lines; header repeats; totals stay together |
| Locales | `id-ID` and `en-US` labels and formatting |
| Fonts | No fallback glyph boxes; embedded fonts listed in the PDF |
| Watermarks | Draft shows `DRAFT`; void shows `VOID`; issued shows neither |
| No leakage | The PDF text contains no internal notes, cost or workspace id |
| Accessibility | Real headings and table headers; reading order matches the visual order; tagged PDF not claimed |

---

## 11. Failure handling

| Failure | User sees | System does |
|---|---|---|
| Worker down | “PDF is queued; you can retry in a moment” | Job stays `QUEUED`; alert after 10 min |
| Chromium crash | “PDF could not be generated. Retry.” | Job retried up to 3 times |
| Print route 500 | Same | Job fails after retries; document remains valid |
| Token expired | Retry generates a new token | No stale URL is reused |
| Page limit | “This document is too long for one PDF.” | `422 PDF_TOO_LARGE`; no partial file |
| Storage down | “PDF storage is unavailable.” | Job retried; editing and issuing continue |

A PDF failure never changes a document's status or totals.

---

## 12. Limits

| Limit | Value |
|---|---|
| Pages | 100 |
| File size | 20 MB |
| Render timeout | 120 s |
| Token lifetime | 5 minutes |
| Concurrent renders per worker | 2 |
| Retained draft previews | 24 hours |

---

## 13. Acceptance tests

| # | Test | Expected |
|---|---|---|
| 1 | Issue and download | PDF opens, number and totals correct |
| 2 | Preview vs PDF | Pixel diff within tolerance |
| 3 | 200-line invoice | Paginates; header repeats; totals not split |
| 4 | 2,000-character description | Wraps and paginates without clipping |
| 5 | Amount in words | Matches the document language and snapshot |
| 6 | Voided invoice | `VOID` watermark; original artefact retained |
| 7 | Draft preview | `DRAFT` watermark; no number |
| 8 | Guest print | Browser dialog; no API call |
| 9 | Expired token | `404`; a new request mints a new token |
| 10 | Foreign token | `404`; no document data |
| 11 | 101 pages | `422 PDF_TOO_LARGE`; no truncation |
| 12 | Worker crash mid-render | Job retried; document unchanged |
| 13 | `id-ID` and `en-US` | Correct labels, separators and currency |
| 14 | PDF text extraction | No internal notes or cost fields |

---

## 14. Related docs

- [`14-DOCUMENT-TEMPLATES.md`](14-DOCUMENT-TEMPLATES.md) — layouts and paper options
- [`0-DOCUMENT-MODEL.md`](0-DOCUMENT-MODEL.md) §5 — the frozen snapshot that is printed
- [`0-SECURITY.md`](0-SECURITY.md) §8 — the worker sandbox
- [`0-API.md`](0-API.md) §3.13 — PDF and print routes
- [`0-TESTING.md`](0-TESTING.md) §9 — visual and pagination tests
