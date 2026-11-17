# 10 — Payments and Receipts

> Manual payment recording, partial payments, receipt documents, balance recalculation and auditable reversal.
> Feature ID `F10` · queue: `api` · phase `P4`
> Last updated: November 2026

---

## 1. Overview

Phase 1 records money the user has already received. It does not process cards, connect to a bank or reconcile a
statement. A payment always belongs to an issued invoice and always produces a receipt document in the same
transaction.

```text
invoice balance ──payment──▶ payment row + receipt document ──▶ new balance and status
                                      │
                                      └──void──▶ payment reversed, invoice recalculated
```

A receipt is evidence of a recorded payment. It is not a blank form, and it cannot exist without a payment.

---

## 2. Fields

| Field | Required | Notes |
|---|---|---|
| Invoice | Yes | Must be `ISSUED`, `PARTIALLY_PAID` or `OVERDUE` |
| Payment date | Yes | Not in the future; defaults to today |
| Amount | Yes | > 0 and ≤ outstanding balance |
| Currency | Derived | Must equal the invoice currency |
| Method | Yes | `CASH`, `BANK_TRANSFER`, `CARD`, `OTHER` |
| Reference | No | Bank reference or transaction id, ≤ 100 characters |
| Notes | No | Internal, ≤ 1,000 characters; not printed unless the user adds it to the receipt |
| Recorded by | Derived | The session user |

The receipt document contains: receipt number, date, customer, invoice number, amount, payment method, amount in
words, company signature and the template. It has one line: “Payment for invoice INV/2026/0007”.

---

## 3. Rules

1. Only an issued (or partially paid/overdue) invoice accepts a payment.
2. Amount must be greater than zero and **not exceed** the outstanding balance. Overpayment is rejected in phase 1;
   there is no customer credit balance.
3. The invoice currency is the payment currency; no conversion.
4. A payment date cannot be in the future (more than one day of clock tolerance).
5. A payment creates exactly one receipt, with its own number from the receipt sequence.
6. Multiple payments per invoice are allowed; each gets its own receipt.
7. The invoice's `amountPaid`, `balanceDue` and status are recalculated in the same transaction.
8. A receipt void reverses the payment; it never deletes the payment row.
9. A payment cannot be edited. Correct a mistake by voiding the receipt and recording a new payment.
10. Every payment and void writes an audit event.

---

## 4. Recording a payment

```text
POST /api/v1/companies/{companyId}/invoices/{id}/payments
Idempotency-Key: <uuid>
{ paymentDate, amount, method, reference, notes }

BEGIN
  lock receipt sequence
  lock invoice row
  verify status in (ISSUED, PARTIALLY_PAID, OVERDUE)
  verify amount > 0 and amount <= balanceDue
  verify currency and date
  insert payment (RECORDED)
  allocate receipt number from the locked sequence
  insert receipt document (RECEIPT, ISSUED) + one line
  write receipt snapshots (issuer, customer, template, calculation)
  update invoice amountPaid, balanceDue, status
  insert audit events (payment.recorded, document.issued for receipt)
  insert background_jobs (pdf.generate for receipt)
COMMIT
```

The invoice row lock serialises concurrent payments. The balance check runs under the lock, so two requests for the
full balance cannot both succeed.

---

## 5. Balance and status

```text
amountPaid = Σ recorded payments (non-voided)
balanceDue = grandTotal − amountPaid          (never negative)
status     = PAID              if balanceDue = 0
           | PARTIALLY_PAID    if 0 < amountPaid < grandTotal and not past due
           | OVERDUE           if 0 < balanceDue and dueDate < today
           | ISSUED            if amountPaid = 0 and not past due
```

A payment on an overdue invoice moves it to `PARTIALLY_PAID` or `PAID` immediately; the next sweep re-evaluates
overdue only if a balance remains and the due date is past.

Example: invoice 1,250,000.

| Event | amountPaid | balanceDue | Status |
|---|---|---|---|
| Issue | 0 | 1,250,000 | `ISSUED` |
| Pay 800,000 | 800,000 | 450,000 | `PARTIALLY_PAID` |
| Pay 450,000 | 1,250,000 | 0 | `PAID` |
| Void the second receipt | 800,000 | 450,000 | `PARTIALLY_PAID` |

---

## 6. Receipt document

| Field | Value |
|---|---|
| Type | `RECEIPT` |
| Status | `ISSUED` |
| Number | From the receipt sequence, e.g. `RCPT/2026/0003` |
| Customer | Invoice customer snapshot |
| Grand total | Payment amount |
| Tax | 0 (a receipt acknowledges money, it does not re-tax it) |
| Amount paid | Payment amount |
| Balance due | 0 |
| Line | “Payment for invoice INV/2026/0007”, quantity 1, unit price = amount |
| Reference | Invoice number; payment reference in the notes area if provided |
| Snapshot | `calculationSnapshot.receipt` holds the payment id, method and reference so the PDF can print how the money arrived |

The receipt has its own template snapshot and PDF. A receipt is not a copy of the invoice and does not repeat the
invoice lines.

---

## 7. Voiding a receipt

```text
POST /api/v1/companies/{companyId}/receipts/{id}/void
{ "reason": "Bank transfer returned" }

BEGIN
  lock receipt row and payment row
  verify receipt status = ISSUED and payment status = RECORDED
  mark payment VOIDED, set voidedAt/voidedBy/reason
  mark receipt VOID
  recompute invoice amountPaid and balanceDue from non-voided payments
  recompute invoice status
  enqueue voided receipt PDF
  insert audit events (receipt.voided)
COMMIT
```

Rules:

- A voided receipt keeps its number forever.
- Voiding twice answers `409 DOCUMENT_STATE_INVALID`.
- The invoice cannot be voided while any non-voided payment exists.
- The void does not delete the payment, receipt, line or PDF; the download serves a `VOID`-watermarked copy.

---

## 8. Permissions and UI

| Action | Owner | Admin | Member | Viewer |
|---|---|---|---|---|
| Record payment | ✓ | ✓ | ✓ | — |
| Void receipt | ✓ | ✓ | — | — |
| View payments | ✓ | ✓ | ✓ | ✓ |

UI:

- The invoice detail shows amount paid, balance, a payment history and **Record payment**.
- The payment sheet prefills the balance, shows the currency and blocks an amount above it.
- Success shows the receipt number and a **Download receipt** action.
- A voided receipt is shown struck through with its reason and date; the invoice balance updates in place.
- The dashboard receivable figure updates after the transaction, not optimistically.

---

## 9. Limits

| Limit | Value |
|---|---|
| Amount | 4 decimals, ≤ invoice balance |
| Payment reference | 100 characters |
| Notes | 1,000 characters |
| Payments per invoice | No hard limit; the balance bounds it |
| Future date tolerance | 1 day |
| Idempotency key | 8–128 characters, 24 hours |

---

## 10. Acceptance tests

| # | Test | Expected |
|---|---|---|
| 1 | Pay the full balance | `PAID`, balance 0, one receipt |
| 2 | Pay half | `PARTIALLY_PAID`, balance exact |
| 3 | Pay more than the balance | `422 PAYMENT_EXCEEDS_BALANCE`, no rows written |
| 4 | Pay a draft invoice | `409 DOCUMENT_STATE_INVALID` |
| 5 | Pay a void invoice | `409` |
| 6 | Two concurrent full payments | One succeeds; balance never negative |
| 7 | Void the receipt | Balance restored, status recalculated, audit present |
| 8 | Void twice | `409` |
| 9 | Void a receipt on a paid invoice | Invoice returns to `PARTIALLY_PAID` |
| 10 | Future payment date | `422 PAYMENT_DATE_INVALID` |
| 11 | Different currency | `422 CURRENCY_MISMATCH` |
| 12 | Retry with the same idempotency key | Same response, one payment |
| 13 | Receipt PDF | Amount, invoice number and words correct |
| 14 | Voided receipt PDF | `VOID` watermark; number retained |
| 15 | Cross-workspace invoice id | `404` |

---

## 11. Related docs

- [`07-DOCUMENT-LIFECYCLE.md`](07-DOCUMENT-LIFECYCLE.md) §2.4–§2.5 — invoice and receipt transitions
- [`0-DOCUMENT-MODEL.md`](0-DOCUMENT-MODEL.md) — receipt as a document
- [`08-PDF-AND-PRINT.md`](08-PDF-AND-PRINT.md) — receipt PDF
- [`0-API.md`](0-API.md) §3.12 — payment routes
- [`0-DATABASE.md`](0-DATABASE.md) §3.13 — `payments`
