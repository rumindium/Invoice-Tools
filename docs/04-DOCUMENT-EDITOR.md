# 04 — Document Editor

> The guided editor for quotations, sales orders, delivery orders, invoices and receipts: parties, dates, line
> items, discounts, charges, notes, totals, preview, save and issue.
> Feature ID `F04` · queue: `client` · phase `P1`
> Last updated: November 2026

---

## 1. Overview

The editor is one component family with a per-type configuration, not five separate forms. A quotation shows
`validUntil`, an invoice shows `dueDate`, a delivery order shows delivery fields, and a receipt is mostly
read-only because it is created by recording a payment.

The flow is deliberately linear:

```text
1. Type  →  2. Parties  →  3. Items  →  4. Review  →  5. Issue or print
```

A user may jump to any step; the review sheet is the only gate before a number is allocated.

---

## 2. Creating a document

| Type | Account | Guest | Notes |
|---|---|---|---|
| Quotation / SPH | Yes | Yes | `validUntil`; accept/reject later |
| Sales order | Yes | No | Requires the sales workflow (P3) |
| Delivery order | Yes | No | Created directly or from an order (P3) |
| Invoice | Yes | Yes | `dueDate`; payments later |
| Receipt | Created by a payment | Yes, as a standalone document | Account receipts always represent a recorded payment |

Guest creation is limited to the three standalone documents. A guest receipt is a printable acknowledgement, not a
claim that a payment was recorded in a system.

---

## 3. Fields

### 3.1 Document

| Field | Behaviour |
|---|---|
| Company | Defaults to the last used; required to issue |
| Customer | Picker, one-time form, or empty until issue |
| Issue date | Defaults to today in the company time zone |
| Due date | Invoices; defaults to issue date + payment term |
| Valid until | Quotations; defaults to issue date + 30 days |
| Reference | Customer PO or contract, ≤ 100 characters |
| Currency | Company default; changing it prompts because it resets prices, not converts them |
| Tax mode | Exclusive or inclusive; changing it recalculates the preview and explains the effect |
| Template | Company default; preview updates immediately |
| Notes | Printed on the document |
| Terms | Printed below the totals |
| Signatory | From the company, overridable per document |

### 3.2 Line items

Each line has item name, description, quantity, unit, unit price, discount type and value, tax rate, and computed
subtotal, tax and total. The editor supports add, edit, delete and reorder.

| Action | Behaviour |
|---|---|
| Add blank line | Appends at the end and focuses the name |
| Add from catalog | Opens the picker; copies name, description, unit, price and tax |
| Duplicate line | Copies the line directly below, with the same values |
| Delete | Removes the row and renumbers positions; confirmation only for a line with content |
| Reorder | Drag handle, or **Move up** / **Move down** buttons for keyboard users |
| Bulk apply tax | Sets one tax rate on all lines after confirmation |

Quantity and price accept a decimal comma or point according to the locale; the stored value is a point-decimal
string. A pasted `1.234,56` is parsed by the active locale, never guessed.

### 3.3 Discount and charges

| Field | Behaviour |
|---|---|
| Document discount | None, percent or fixed amount; applied to the net line total before tax |
| Shipping | Net amount, optional tax rate |
| Additional charges | Net amount, optional tax rate (same rate as shipping) |
| Charges tax | Computed and shown separately |

Charges are entered **excluding tax**, regardless of the line tax mode. The editor labels them "excl. tax" to
avoid ambiguity.

### 3.4 Totals

The editor shows subtotal, discount total, tax (grouped by rate), shipping, additional charges, charges tax and
grand total. For invoices it also shows amount paid and balance due once payments exist. The amount in words is
shown below the grand total and matches the document language.

---

## 4. Validation

| Rule | Message |
|---|---|
| At least one line to issue | "Add at least one item before issuing." |
| Quantity > 0 | "Quantity must be greater than zero." |
| Unit price ≥ 0 | "Unit price cannot be negative." |
| Discount ≤ line gross | "Discount cannot exceed the line amount." |
| Document discount ≤ net total | "Discount cannot exceed the subtotal." |
| Tax rate 0–100 | "Tax rate must be between 0 and 100." |
| Due/valid date ≥ issue date | "The date cannot be before the issue date." |
| Company legal name and address | "Complete your company profile before issuing." |
| Customer name | "Choose a customer or enter a name." |
| Currency supported | "This currency is not enabled." |
| Notes/terms within limits | "Shorten this text to 5,000 characters." |

Drafts may be incomplete but never invalid. A field with an invalid value blocks saving, so a draft cannot store
a negative quantity or an unknown currency.

---

## 5. Save, autosave and conflict

- **Save draft** is explicit; the editor also autosaves 1.5 seconds after the last change.
- The header shows `Saved`, `Saving…`, `Unsaved changes` or `Offline`.
- Save sends `If-Match: "rev-<version>"`. A `409 DOCUMENT_VERSION_CONFLICT` stops autosave and opens a dialog:
  *Reload server version* or *Keep my draft* (which retries with the latest version after a confirmation).
- Closing the tab with unsaved changes triggers the browser's leave confirmation.
- Guest drafts save to IndexedDB with the same debounce; there is no server conflict.
- A failed save preserves the entered values and shows a retry; it never clears the form.

---

## 6. Issue

The review sheet shows:

```text
Document      Invoice
Number        will be assigned (INV/2026/0013)
Customer      PT Pelanggan
Issue date    17 November 2026
Due date      1 December 2026
Total         IDR 974,050
Template      Classic
[ Back ]  [ Issue invoice ]
```

- Issue is disabled while invalid, while saving, or when the user lacks permission.
- The action is idempotent with an `Idempotency-Key`; a double click cannot allocate two numbers.
- After success, the editor becomes read-only, shows the number and status, and offers **Download PDF**,
  **Print**, **Record payment** (invoice) or **Convert** (quotation/order).
- A failed PDF job does not undo the issue; the document remains valid and the PDF can be retried.

---

## 7. Guest and account differences

| Aspect | Guest | Account |
|---|---|---|
| Storage | IndexedDB | PostgreSQL |
| Number | Local `DRAFT-0003` | Reserved at issue |
| Company/customer | One-time fields | Directory pickers |
| Catalog | Not available | Available |
| PDF | Browser print | Server PDF, browser print also available |
| History | Local draft list | Document list and filters |
| Conversion | Not available | Available (P3) |
| Payments | Not available | Available (P4) |

Saving a guest draft to an account uploads it once, recalculates on the server, stores it as a draft and keeps the
local copy until the save succeeds. See [`12-GUEST-MODE-AND-ACCOUNTS.md`](12-GUEST-MODE-AND-ACCOUNTS.md).

---

## 8. Preview and responsiveness

- The preview is the same Angular print component used by the PDF worker, scaled to the panel.
- Desktop: three columns; tablet: preview drawer; mobile: preview tab and fixed action bar.
- The preview updates after a 150 ms debounce while typing and immediately on blur.
- The preview never shows a different number, total or tax than the editor; both read the same calculated model.
- Zoom controls are fit-to-width and 100%; the paper edge is visible on the grey canvas.

---

## 9. Limits

| Limit | Value |
|---|---|
| Lines | 200 |
| Item name | 200 characters |
| Description | 2,000 characters |
| Notes / terms | 5,000 characters each |
| Reference | 100 characters |
| Quantity | 1,000,000 |
| Unit price | 999,999,999,999.9999 |
| Custom unit | 20 characters |
| Autosave debounce | 1,500 ms |
| Preview debounce | 150 ms |

---

## 10. Acceptance tests

| # | Test | Expected |
|---|---|---|
| 1 | Create an invoice with one line and issue | Number assigned, status `ISSUED`, editor read-only |
| 2 | Add, edit, delete and reorder lines | Positions contiguous; totals correct after each action |
| 3 | Quantity 0 | Save blocked with a field error; draft unchanged |
| 4 | Change tax mode exclusive → inclusive | Totals recalculate; the grand total explains the difference |
| 5 | Two tabs edit the same draft | Second save gets `409`; the dialog offers reload or keep |
| 6 | Guest reloads the page | Draft restored from IndexedDB |
| 7 | Guest clears browser data | Draft gone; the UI said this would happen |
| 8 | Issue with a missing company address | Blocked with a link to the company profile |
| 9 | Double-click Issue | One number, one PDF job, one audit event |
| 10 | Mobile width 390 px | Form usable; preview is a tab; action bar reachable |
| 11 | 200 lines | Editor remains responsive; recalculation under 16 ms |
| 12 | Currency change | Prices are not converted; the user is warned and confirms |

---

## 11. Related docs

- [`05-CALCULATIONS-AND-TAX.md`](05-CALCULATIONS-AND-TAX.md) — every number shown in the editor
- [`07-DOCUMENT-LIFECYCLE.md`](07-DOCUMENT-LIFECYCLE.md) — what happens after issue
- [`08-PDF-AND-PRINT.md`](08-PDF-AND-PRINT.md) — the preview and print route
- [`0-UI-DESIGN.md`](0-UI-DESIGN.md) §4 — layout and interaction
- [`12-GUEST-MODE-AND-ACCOUNTS.md`](12-GUEST-MODE-AND-ACCOUNTS.md) — local drafts and upload
