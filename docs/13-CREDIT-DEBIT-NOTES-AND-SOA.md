# 13 — Credit Notes, Debit Notes and Statements of Account

> Phase 2 adjustments that correct an invoice without rewriting it, and a customer statement computed from
> documents and payments with a running balance.
> Feature ID `F13` · queue: `api` · phase `P5`
> Last updated: November 2026

---

## 1. Overview

A wrong invoice is not edited. It is corrected with a credit note (reduce what is owed) or a debit note (increase
it). A statement of account (SOA) then summarises a customer's invoices, payments and adjustments over a period
with an opening balance, running balance and closing balance.

```text
INVOICE ──credit note──▶ lower balance
INVOICE ──debit note───▶ higher balance
CUSTOMER ──statement───▶ opening + invoices − payments − credits + debits = closing
```

Both notes are documents with their own numbers, snapshots and PDFs. A statement is a generated report, not a
stored document.

---

## 2. Credit note

### 2.1 Fields

| Field | Required | Notes |
|---|---|---|
| Invoice | Yes | Must be issued, partially paid, paid or overdue |
| Issue date | Yes | Not before the invoice issue date |
| Reason | Yes | 10–500 characters, printed on the note |
| Currency | Derived | Same as the invoice |
| Lines | Yes | One or more lines describing the credit |
| Tax mode | Derived | Same as the invoice |
| Amount | Computed | ≤ invoice balance (phase 2) |

### 2.2 Rules

- A credit note reduces the invoice's balance by its grand total.
- The amount cannot exceed the outstanding balance in phase 2; a larger credit is a refund workflow that is not
  implemented.
- Issuing allocates a `CN/…` number, freezes a snapshot, writes a `CREDIT_OF` relation and updates the invoice
  balance and status in the same transaction.
- The invoice itself is never edited: its `grandTotal` stays, while `amountPaid` and `balanceDue` reflect the
  credit. The statement shows the credit as a separate entry.
- A credit note can be voided, which reverses its balance effect and marks it `VOID` with a reason.
- A credit note cannot be issued against a draft or void invoice.
- A credit note for a paid invoice is not allowed in phase 2 (no customer credit balance).

### 2.3 Balance effect

```text
invoice.balanceDue = invoice.grandTotal − amountPaid − appliedCredits + appliedDebits
```

The stored `amountPaid` remains the sum of non-voided payments. `appliedCredits` and `appliedDebits` are sums of
issued, non-voided notes. The balance never goes below zero; a larger credit is rejected.

---

## 3. Debit note

### 3.1 Fields

| Field | Required | Notes |
|---|---|---|
| Invoice | Yes | Issued, partially paid, paid or overdue |
| Issue date | Yes | |
| Reason | Yes | Printed on the note |
| Lines | Yes | What is additionally owed |
| Amount | Computed | > 0 |

### 3.2 Rules

- A debit note increases the invoice balance by its grand total.
- It allocates a `DN/…` number, freezes a snapshot and writes a `DEBIT_OF` relation.
- The invoice status recalculates: an increase can turn `PAID` back into `PARTIALLY_PAID` (the customer owes the
  difference) while `amountPaid` is unchanged.
- A debit note can be voided, reversing its effect.
- It cannot be issued against a draft or void invoice.

---

## 4. Statement of account

### 4.1 Scope

- One customer, one currency, one date range.
- Company time zone.
- Only non-voided invoices (`ISSUED`, `PARTIALLY_PAID`, `PAID`, `OVERDUE`), non-voided receipts/payments and
  issued non-voided notes.
- Drafts, quotations, orders and delivery orders are excluded.
- The statement is generated at request time from persisted rows; no closing balance is stored on the customer.

### 4.2 Calculation

```text
opening = Σ invoices before from (grandTotal)
        − Σ payments before from (amount)
        − Σ credit notes before from (grandTotal)
        + Σ debit notes before from (grandTotal)

each entry in range:
  invoice       +grandTotal
  payment       −amount
  credit note   −grandTotal
  debit note    +grandTotal

running = previous balance + signed amount
closing = opening + Σ entries in range
```

Rules:

- A payment's amount is the money received; a receipt is its evidence, not a second debit.
- A voided payment is excluded; the reversal is reflected because it is no longer counted.
- A voided note is excluded.
- Opening and closing are computed per currency; a statement never mixes currencies.
- Rounding is at currency minor units; the running balance never displays sub-unit values.
- If the customer has no activity, the statement is valid with zero entries and an opening equal to the closing.

### 4.3 Example

Customer with a 1,000,000 invoice on 1 November, a 400,000 payment on 10 November and a 100,000 credit note on
15 November. Statement range 1–30 November:

| Date | Entry | Debit | Credit | Balance |
|---|---|---|---|---|
| 1 Nov | Opening | — | — | 0 |
| 2 Nov | Invoice INV/2026/0007 | 1,000,000 | | 1,000,000 |
| 10 Nov | Receipt RCPT/2026/0003 | | 400,000 | 600,000 |
| 15 Nov | Credit note CN/2026/0001 | | 100,000 | 500,000 |
| 30 Nov | Closing | | | 500,000 |

### 4.4 Output

- JSON for the UI and a PDF for sending to the customer.
- The PDF contains the company header, customer, period, table of entries, opening, closing and a note that the
  statement is generated from records.
- It is not a tax invoice and does not replace one.
- No statement number is allocated; the document is identified by customer, period and generated timestamp.
- A statement is not stored as a document. Re-requesting the same period recomputes the same figures from the same
  rows; the PDF is a temporary artefact with a 24-hour TTL.

### 4.5 Ageing (phase 2 follow-up)

Ageing buckets (current, 1–30, 31–60, 61–90, 90+) are shown on the statement when enabled. They are derived from
`dueDate` and `balanceDue`, not stored. If the buckets are not implemented, the statement omits them rather than
showing a fake breakdown.

---

## 5. UI

| Screen | Content |
|---|---|
| Invoice detail | **Credit note** and **Debit note** actions; list of applied notes |
| Note editor | Invoice reference, reason, lines, totals, preview |
| Note detail | Number, status, reason, PDF, **Void** |
| Customer detail | **Statement** action with a date range and currency |
| Statement view | Opening, entries, running balance, closing, **Download PDF** |

A note shows the invoice number it adjusts and the balance before and after. A voided note is struck through with
its reason.

---

## 6. Permissions and limits

| Action | Owner | Admin | Member | Viewer |
|---|---|---|---|---|
| Create/issue credit or debit note | ✓ | ✓ | — | — |
| Void note | ✓ | ✓ | — | — |
| View statement | ✓ | ✓ | ✓ | ✓ |

| Limit | Value |
|---|---|
| Credit ≤ invoice balance | Enforced |
| Reason | 10–500 characters |
| Lines per note | 200 |
| Statement range | 5 years |
| Statement entries | 10,000; larger ranges are rejected with a clear message |
| Statement PDF TTL | 24 hours |

---

## 7. Acceptance tests

| # | Test | Expected |
|---|---|---|
| 1 | Credit 100,000 on a 1,000,000 invoice | Balance 900,000; note issued; relation present |
| 2 | Credit above the balance | `422`, no rows written |
| 3 | Credit a draft invoice | `409 DOCUMENT_STATE_INVALID` |
| 4 | Void a credit note | Balance restored; note `VOID`; number retained |
| 5 | Debit 50,000 on a paid invoice | Status returns to `PARTIALLY_PAID`; balance 50,000 |
| 6 | Debit note void | Status returns to `PAID`; balance 0 |
| 7 | Statement example §4.3 | Opening 0, closing 500,000, running balances exact |
| 8 | Statement across a payment before the range | Opening includes it |
| 9 | Voided payment before the range | Excluded from opening |
| 10 | Two currencies | Separate statements; no combined total |
| 11 | Statement PDF | Figures match the JSON; no tax-invoice claim |
| 12 | Foreign customer id | `404` |
| 13 | Statement with 10,001 entries | Rejected with a clear message; no partial PDF |

---

## 8. Related docs

- [`07-DOCUMENT-LIFECYCLE.md`](07-DOCUMENT-LIFECYCLE.md) §2.6 — note transitions
- [`10-PAYMENTS-AND-RECEIPTS.md`](10-PAYMENTS-AND-RECEIPTS.md) — payments counted in a statement
- [`0-DOCUMENT-MODEL.md`](0-DOCUMENT-MODEL.md) §8 — `CREDIT_OF` / `DEBIT_OF` relations
- [`08-PDF-AND-PRINT.md`](08-PDF-AND-PRINT.md) — note and statement PDFs
