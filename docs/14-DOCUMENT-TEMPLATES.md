# 14 — Document Templates

> Built-in layouts, paper size, accent colour, logo placement, footer, bank details and signature, with a frozen
> template snapshot on every issued document.
> Feature ID `F14` · queue: `api + worker` · phase `P2` (built-ins), `P5` (company configuration)
> Last updated: November 2026

---

## 1. Overview

A template decides how a document looks, not what it contains. Three built-in layouts cover the common cases; a
company may configure colour, paper and a few blocks. User-supplied HTML is deliberately not supported: it would be
a code-execution surface in the PDF worker.

```text
DATA (frozen snapshot)  +  TEMPLATE (frozen snapshot)  →  one Angular layout  →  preview / PDF
```

Changing a template later never changes an issued document, because the template settings are copied into
`templateSnapshot` at issue.

---

## 2. Built-in layouts

| Layout | Character | Best for |
|---|---|---|
| `classic` | Serif title, logo left, thin rules, conventional table | General business, formal invoices |
| `modern` | Accent band, logo right, larger total, generous spacing | Studios, agencies, services |
| `minimal` | Monochrome, compact, no band, small logo | Freelancers, simple receipts |

All three share the same section order and the same data. They differ in typography, spacing, logo position and
where the accent is used. No layout hides a field that affects the total.

---

## 3. Configuration

| Field | Values | Default | Applies to |
|---|---|---|---|
| `layout` | `classic`, `modern`, `minimal` | `classic` | Whole document |
| `paperSize` | `A4`, `LETTER` | `A4` | Print and PDF |
| `orientation` | `portrait` | `portrait` | Phase 1 only |
| `accentColor` | `#RRGGBB` | `#1F5F5B` | Title rule, table header, total |
| `logoPosition` | `left`, `center`, `right`, `none` | `left` | Header |
| `showBankDetails` | boolean | `true` | Footer |
| `showSignature` | boolean | `true` | Footer |
| `showPricesOnDelivery` | boolean | `false` | Delivery order only |
| `footerText` | ≤ 2,000 characters | empty | Footer, replaces terms if the document has none |
| `isDefault` | boolean | one per company | New documents |

A template is a company-level setting. A document may choose another template while it is a draft; the choice is
frozen at issue.

---

## 4. Template snapshot

```json
{
  "templateId": "tpl_01J…",
  "layout": "classic",
  "paperSize": "A4",
  "orientation": "portrait",
  "accentColor": "#1F5F5B",
  "logoPosition": "left",
  "showBankDetails": true,
  "showSignature": true,
  "showPricesOnDelivery": false,
  "footerText": "Payment within 14 days."
}
```

Rules:

- The snapshot is written at issue, alongside the issuer, customer and calculation snapshots.
- It references `templateId` for traceability but contains every value needed to render.
- Archiving a template does not break an issued document; the snapshot carries the settings.
- A system template (company id null) can be cloned into a company template; the clone is independent.
- The layout engine reads only the snapshot, never the live template row, when rendering an issued document.

---

## 5. Paper and typography

| Property | A4 | Letter |
|---|---|---|
| Size | 210 × 297 mm | 8.5 × 11 in |
| Margins | 18 mm top/bottom, 16 mm sides | 0.7 in top/bottom, 0.6 in sides |
| Content width | 178 mm | 7.3 in |
| Table font | Inter 9 pt | Inter 9 pt |
| Body font | Inter 10 pt | Inter 10 pt |
| Title | Source Serif 4 22 pt | Source Serif 4 22 pt |

Both sizes use the same layout rules and page-break behaviour ([`08-PDF-AND-PRINT.md`](08-PDF-AND-PRINT.md) §6).

---

## 6. Sections

| Section | Visible when | Notes |
|---|---|---|
| Logo | `logoPosition != none` and the company has a logo | Never stretched; max 45 mm wide |
| Issuer block | Always | Name, address, contact, tax id |
| Document title | Always | Uses the quotation/SPH label |
| Meta | Always | Number, dates, reference, currency |
| Customer block | Always | Name, billing address, tax id |
| Shipping block | Address differs and the type has one | |
| Item table | Always | Prices hidden on a delivery order unless enabled |
| Totals | Always | Tax grouped by rate |
| Amount in words | Always | Document language |
| Notes | When present | |
| Terms | When present, else the template footer | |
| Bank details | `showBankDetails` and company has accounts | ≤ 5 accounts |
| Signature | `showSignature` and a signatory name | Name and title above the line |
| Page footer | Always | Page x of y |

---

## 7. Company templates (P5)

- A company may clone a built-in layout and change the allowed settings.
- The clone has its own id, name and slug; it is archived rather than deleted.
- Only one default per company.
- A template used by a draft can be edited; the draft reflects the change until it is issued.
- A template used by an issued document can be edited; the issued snapshot is unaffected.
- Custom HTML, custom CSS uploads, external font URLs and arbitrary images in the layout are not supported.

---

## 8. UI

| Screen | Content |
|---|---|
| Template list | Cards with a live thumbnail of a sample document, default badge, **Set default**, **Archive** |
| Template editor | Layout, paper, accent, logo position, footer, toggles; live preview on the right |
| Editor template picker | Select with a mini preview; changing it updates the preview immediately |
| Template preview | The real print component with sample data, not a screenshot |

The template editor preview uses fictional sample data and never a real customer's document. The document editor
preview uses the current draft.

---

## 9. Limits

| Limit | Value |
|---|---|
| Company templates | 10 |
| Template name | 80 characters |
| Footer | 2,000 characters |
| Accent | valid `#RRGGBB` |
| Logo width in the document | 45 mm |
| Paper sizes | A4, Letter |
| Orientation | Portrait |

---

## 10. Acceptance tests

| # | Test | Expected |
|---|---|---|
| 1 | Switch classic → modern on a draft | Preview updates; totals unchanged |
| 2 | Issue with a template, then edit it | Issued PDF unchanged; new drafts use the new settings |
| 3 | Change accent to an invalid value | Validation error |
| 4 | Letter paper | PDF page size is 8.5 × 11 in |
| 5 | Hide bank details | Footer omits the accounts |
| 6 | Hide signature | No signature line; signatory name not printed |
| 7 | Delivery order with prices off | No price, discount or total columns |
| 8 | Delivery order with prices on | Prices and totals printed |
| 9 | Archive the default template | Blocked until another default is chosen |
| 10 | Template snapshot on an issued document | Contains every setting; PDF matches preview |
| 11 | Custom HTML attempt | Not offered; no upload field |
| 12 | Two companies | Independent template lists and defaults |

---

## 11. Related docs

- [`08-PDF-AND-PRINT.md`](08-PDF-AND-PRINT.md) — how the template becomes a PDF
- [`0-DOCUMENT-MODEL.md`](0-DOCUMENT-MODEL.md) §5 — the template snapshot
- [`0-UI-DESIGN.md`](0-UI-DESIGN.md) §8 — document design rules
- [`0-API.md`](0-API.md) §3.8 — template routes
