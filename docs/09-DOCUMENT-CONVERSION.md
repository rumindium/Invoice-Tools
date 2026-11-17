# 09 — Document Conversion

> Quotation → sales order → delivery order → invoice, with field mapping, source links, duplicate guards and a
> review step before anything is issued.
> Feature ID `F09` · queue: `api` · phase `P3`
> Last updated: November 2026

---

## 1. Overview

Conversion turns an accepted offer into the next operational document without retyping lines. It always creates a
**new draft**; the source is never modified. The user reviews and edits the draft before issuing it.

```text
QUOTATION / SPH ──▶ SALES ORDER ──▶ DELIVERY ORDER ──▶ INVOICE
       │                  │                              ▲
       │                  └──────────────────────────────┘
       └── revision (new draft, not a conversion)
```

A receipt is not created by copying an invoice. It is created when a payment is recorded
([`10-PAYMENTS-AND-RECEIPTS.md`](10-PAYMENTS-AND-RECEIPTS.md)). A credit note is an adjustment, not a copy
([`13-CREDIT-DEBIT-NOTES-AND-SOA.md`](13-CREDIT-DEBIT-NOTES-AND-SOA.md)).

---

## 2. Supported paths

| Source | Target | Endpoint | Phase |
|---|---|---|---|
| Quotation (accepted) | Sales order | `POST …/quotations/:id/convert-to-sales-order` | P3 |
| Sales order (confirmed/processing) | Delivery order | `POST …/sales-orders/:id/convert-to-delivery-order` | P3 |
| Sales order (confirmed/processing) | Invoice | `POST …/sales-orders/:id/convert-to-invoice` | P3 |
| Delivery order (delivered) | Invoice | `POST …/delivery-orders/:id/convert-to-invoice` | P3 |
| Invoice | Receipt | Via `POST …/invoices/:id/payments` | P4 |
| Invoice | Credit/debit note | Adjustment endpoints | P5 |

`GET …/documents/:id/conversion-options` returns which targets are available, why a path is blocked, and whether a
target already exists.

---

## 3. Rules

1. The source must be in a convertible status; a draft quotation cannot become an order.
2. The source is never changed: no status, no total, no line, no snapshot.
3. The target starts as `DRAFT`, with no number and no snapshots.
4. The target copies commercial data, then the user may edit it before issue.
5. A relation row records `CONVERTED_TO` from source to target.
6. A second active target is blocked with `409 DUPLICATE_CONVERSION`; `allowDuplicate=true` requires a reason and
   is audited.
7. Cancelled or void targets do not count as active.
8. Currency, company and customer are preserved. They are not silently converted.
9. Partial delivery and partial invoicing are later; the phase 1 target copies the full remaining quantity.
10. Conversion is idempotent with an `Idempotency-Key`, so a retry does not create two drafts.

---

## 4. Field mapping

### 4.1 Quotation → Sales order

| Source field | Target | Notes |
|---|---|---|
| Company | Company | Same legal issuer |
| Customer / one-time customer | Customer | Snapshot copied for a one-time customer |
| Currency, tax mode | Same | No conversion |
| Lines | Lines | Name, description, quantity, unit, price, discount, tax |
| Document discount | Same | Recalculated for the target |
| Shipping, additional charges, charges tax rate | Same | |
| Notes, terms | Same | Editable in the target |
| Reference | Same | Plus `Source: QUO/2026/0042` in the internal reference |
| Issue date | Today | |
| `validUntil` | Cleared | Order has no validity date |
| Due date | Cleared | Set on the invoice instead |
| Template | Company default or source template | Editable |
| Quotation number | Relation only | Not printed as the order number |

### 4.2 Sales order → Delivery order

| Source field | Target | Notes |
|---|---|---|
| Company, customer | Same | Shipping address preferred when present |
| Lines | Same quantities and descriptions | Prices copied but hidden by default |
| Discounts and charges | Copied | Hidden when prices are hidden |
| Currency | Same | |
| Issue date | Today | |
| Order number | Relation and reference | Printed as “Order: SO/2026/0017” |
| Delivery date | Empty | Set when the user marks it delivered |

A delivery order is about goods, not money. The default template hides unit prices and totals; enabling
`showPricesOnDelivery` is a template choice.

### 4.3 Sales order → Invoice

| Source field | Target | Notes |
|---|---|---|
| Company, customer | Same | Billing address |
| Lines | Same | Full ordered quantity in phase 1 |
| Discounts and charges | Same | Recalculated |
| Currency, tax mode | Same | |
| Issue date | Today | |
| Due date | Issue + customer/company payment term | Editable |
| Order number | Reference | Printed as “Order: SO/2026/0017” |
| Notes, terms | Same | |

The invoice is independent after creation: changing the order later does not change the invoice.

### 4.4 Delivery order → Invoice

| Source field | Target | Notes |
|---|---|---|
| Company, customer | Same | |
| Lines | Delivered quantities | Full document in phase 1 |
| Prices | From the delivery order (copied from the order) | |
| Delivery number | Reference | Printed as “Delivery: DO/2026/0009” |
| Due date | Issue + payment term | |

---

## 5. Duplicate and partial rules

- **Active target:** a target whose status is not `CANCELLED` or `VOID`.
- One invoice per delivery order, one delivery order per order, one invoice per order by default. The guard is
  enforced in the service under a transaction, not only in the UI.
- `allowDuplicate=true` requires a non-empty reason (10–500 characters) and writes `document.converted` with
  `duplicate: true`.
- Partial delivery and partial invoicing are deferred. The UI does not pretend to support them; the whole document
  is converted.
- A cancelled target frees the path; the new target gets a new number.

---

## 6. Data and relations

```text
document_relations
  source_document_id = doc_quotation
  target_document_id = doc_order
  relation_type      = CONVERTED_TO
```

- Both documents must belong to the same workspace and company.
- The relation is created in the same transaction as the target draft.
- The source detail shows its targets; the target detail shows its source.
- Deleting a draft target removes the relation; an issued target cannot be deleted.
- A receipt relation uses `RECEIPT_FOR` and is created by the payment transaction.

---

## 7. UI

| Screen | Content |
|---|---|
| Source detail | **Convert to…** menu with available targets and disabled reasons |
| Conversion review | Target type, copied lines, editable draft, **Create draft** |
| Target detail | Source link (“From quotation QUO/2026/0042”), status, issue action |
| Duplicate warning | “An invoice already exists for this order: INV/2026/0007. Create another?” with a reason field |

The review is a draft editor, not a modal confirmation. Users can change dates, lines, discounts and terms before
saving.

---

## 8. Acceptance tests

| # | Test | Expected |
|---|---|---|
| 1 | Accept a quotation, convert | Order draft with copied lines and a relation |
| 2 | Convert a draft quotation | `409 DOCUMENT_STATE_INVALID` |
| 3 | Convert the same quotation twice | Second `409 DUPLICATE_CONVERSION` |
| 4 | Convert with `allowDuplicate` and a reason | Second draft created; audit records the override |
| 5 | Order → delivery | Prices hidden by default; quantities copied |
| 6 | Delivery → invoice | Reference shows the delivery number |
| 7 | Change the source after conversion | Target unchanged |
| 8 | Edit the target before issue | Allowed; source unchanged |
| 9 | Cancel a target, convert again | Allowed; new target |
| 10 | Two concurrent conversions | One `201`, one `409` |
| 11 | Foreign source id | `404` |
| 12 | Currency mismatch attempt | Rejected; no conversion across currencies |

---

## 9. Related docs

- [`07-DOCUMENT-LIFECYCLE.md`](07-DOCUMENT-LIFECYCLE.md) — statuses required to convert
- [`0-DOCUMENT-MODEL.md`](0-DOCUMENT-MODEL.md) §8 — relation types
- [`10-PAYMENTS-AND-RECEIPTS.md`](10-PAYMENTS-AND-RECEIPTS.md) — invoice → receipt through payment
- [`0-API.md`](0-API.md) §3.11 — conversion routes
