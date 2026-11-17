# 07 — Document Lifecycle

> Status machines for every document type, the issue snapshot, revisions, controlled voids, overdue derivation and
> the audit trail.
> Feature ID `F07` · queue: `api` · phase `P1` (draft/issue), `P3` (full sales chain)
> Last updated: November 2026

---

## 1. Overview

A document's status is the result of an explicit business event, never a free-form field the UI can set. Each
transition has a guard, a side effect and an audit record. The domain package owns the transition table; the API
enforces it under a row lock.

```text
DRAFT ──issue──▶ SENT / ISSUED / CONFIRMED ──business events──▶ terminal state
                                                              (accepted, rejected, paid, void, …)
```

An issued document is immutable. The only ways to change its commercial content are a new revision (a new
document), a controlled void, or an adjustment document.

---

## 2. State machines

### 2.1 Quotation / SPH

| From | To | Action | Guard | Side effects |
|---|---|---|---|---|
| `DRAFT` | `SENT` | `issue` | Company/customer complete; ≥ 1 line; dates valid; totals valid | Number, snapshots, revision, PDF job, audit |
| `SENT` | `ACCEPTED` | `accept` | — | Audit; conversion becomes available |
| `SENT` | `REJECTED` | `reject` | Optional note | Audit |
| `SENT` | `EXPIRED` | `expire` | `validUntil` is past | Audit |
| `SENT` | — | `revise` | — | New draft linked by `REVISED_FROM`; source status unchanged |
| `DRAFT` | deleted | delete | Draft only | Soft delete, audit |

An accepted or rejected quotation is not revised. It can be converted (accepted) or left as a record. `EXPIRED` is
also applied by the hourly sweep when `validUntil < today` and the status is `SENT`.

### 2.2 Sales order

| From | To | Action | Guard | Side effects |
|---|---|---|---|---|
| `DRAFT` | `CONFIRMED` | `confirm` | Customer/company complete; ≥ 1 line | Audit |
| `CONFIRMED` | `PROCESSING` | `process` | — | Audit |
| `PROCESSING` | `COMPLETED` | `complete` | Explicit confirmation | Audit |
| `DRAFT` | `CANCELLED` | `cancel` | Reason | Audit |
| `CONFIRMED` | `CANCELLED` | `cancel` | No issued delivery order or invoice | Audit |
| `PROCESSING` | `CANCELLED` | `cancel` | No issued delivery order or invoice | Audit |
| `COMPLETED` | — | — | Terminal | — |

Phase 1 tracks the order as a whole. Partial delivery and partial invoicing are later; the guard blocks a cancel
once a downstream document exists, rather than pretending to reverse it.

### 2.3 Delivery order

| From | To | Action | Guard | Side effects |
|---|---|---|---|---|
| `DRAFT` | `ISSUED` | `issue` | Company/customer complete; ≥ 1 line | Number, snapshots, revision, PDF job, audit |
| `ISSUED` | `DELIVERED` | `deliver` | Delivery date not in the future | Audit; invoice conversion available |
| `DRAFT` | `CANCELLED` | `cancel` | Reason | Audit |
| `ISSUED` | `CANCELLED` | `cancel` | No delivery recorded | Audit |

`PARTIALLY_DELIVERED` exists in the enum for the later partial-delivery feature but is not offered in phase 1.
The UI says **Mark delivered**, which records the full document as delivered.

### 2.4 Invoice

| From | To | Action | Guard | Side effects |
|---|---|---|---|---|
| `DRAFT` | `ISSUED` | `issue` | Complete document; valid totals | Number, snapshots, revision, PDF job, audit |
| `ISSUED` | `PARTIALLY_PAID` | payment | `0 < amount < balanceDue` | Payment, receipt, balances, audit |
| `ISSUED` | `PAID` | payment | `amount = balanceDue` | Payment, receipt, balances, audit |
| `PARTIALLY_PAID` | `PAID` | payment | `amount = balanceDue` | Payment, receipt, balances, audit |
| `ISSUED` | `OVERDUE` | sweep | `dueDate < today`, balance > 0 | Audit |
| `PARTIALLY_PAID` | `OVERDUE` | sweep | `dueDate < today`, balance > 0 | Audit |
| `OVERDUE` | `PARTIALLY_PAID` | payment | Partial payment | Audit |
| `OVERDUE` | `PAID` | payment | Full payment | Audit |
| `DRAFT` | `VOID` | `void` | Reason | Audit |
| `ISSUED` | `VOID` | `void` | `amountPaid = 0`, reason | Voided PDF, audit |
| `PARTIALLY_PAID` | — | `void` | Blocked; void receipts first or issue a credit note | `409 DOCUMENT_STATE_INVALID` |
| `PAID` | — | `void` | Blocked | `409` |

Overdue is recalculated on every payment and by the hourly sweep. A detail response also returns a derived
`isOverdue` boolean so the UI is correct before the sweep runs, but the stored status is corrected by the sweep.

### 2.5 Receipt

| From | To | Action | Guard | Side effects |
|---|---|---|---|---|
| — | `ISSUED` | payment | Created only by a recorded payment | Number, snapshot, PDF job, audit |
| `ISSUED` | `VOID` | `void` | Reason | Payment reversed, invoice balance and status recalculated, voided PDF, audit |
| `VOID` | — | — | Terminal | — |

A receipt cannot be edited, deleted or reissued. A new payment creates a new receipt.

### 2.6 Credit and debit notes (P5)

| Type | From | To | Action | Guard |
|---|---|---|---|---|
| Credit note | `DRAFT` | `ISSUED` | `issue` | Amount ≤ invoice balance |
| Credit note | `ISSUED` | `VOID` | `void` | Reason; reverses the balance effect |
| Debit note | `DRAFT` | `ISSUED` | `issue` | Amount > 0 |
| Debit note | `ISSUED` | `VOID` | `void` | Reason; reverses the balance effect |

Details are in [`13-CREDIT-DEBIT-NOTES-AND-SOA.md`](13-CREDIT-DEBIT-NOTES-AND-SOA.md).

---

## 3. The issue transaction

```text
BEGIN
  lock sequence row (company, type)                    -- 06 §5
  lock document row; verify status = DRAFT
  recalculate totals from the stored inputs            -- 05
  reject if the client's totals differ
  allocate number
  update document: status, number, issuedAt, totals
  write issuer, customer, template, calculation snapshots
  insert document_revisions (revision 1 or next)
  insert background_jobs (pdf.generate)
  insert audit_events (document.issued)
COMMIT
```

Guards are evaluated **inside** the transaction against the locked row. A guard that reads another document
(downstream conversion exists, payments exist) also runs inside the transaction, so a concurrent payment cannot
slip between the check and the update.

---

## 4. Snapshots and immutability

| Event | Snapshot written? | Editable afterwards? |
|---|---|---|
| Create draft | No | Yes |
| Save draft | No | Yes |
| Issue | Yes, revision 1 | No |
| Revise | New draft; no snapshot until it is issued | The new draft is editable; the source is not |
| Record payment | No new snapshot; invoice totals and status update | Only payment fields |
| Void | No snapshot rewrite; status and PDF change | No |
| Credit/debit note | The note gets its own snapshot at issue | No |

The immutable fields are listed in [`0-DOCUMENT-MODEL.md`](0-DOCUMENT-MODEL.md) §3. A `PATCH` on an issued document
answers `409 DOCUMENT_STATE_INVALID`; there is no “force” flag.

---

## 5. Revisions

- `POST …/documents/:id/revisions` creates a new **draft** with the same type and a `REVISED_FROM` relation.
- The new draft copies commercial fields and lines, gets a new id, and has no number.
- The source keeps its number, status and snapshots. The UI shows “Revised by INV/2026/0014” on the source.
- A revision is offered for quotations and sales orders; invoices use a void and reissue or a credit note.
- Duplicate revisions are allowed only with a reason; the previous open revision is not automatically closed.

---

## 6. Voids

| Document | Allowed when | Effect |
|---|---|---|
| Draft invoice | Always | Soft-delete or `VOID`; no number |
| Issued invoice | No payments recorded | Status `VOID`, reason, VOID-watermarked PDF, number retained |
| Receipt | Always (reason required) | Payment `VOIDED`; invoice amount and status reversed |
| Credit/debit note | Not yet applied, or reversal supported | Balance reversed, reason recorded |

A void never deletes a row, never returns a number and never removes audit history. The original issued PDF is
retained for audit; the download serves the voided copy with a watermark and a new storage key
(`r{revision}-void.pdf`).

---

## 7. Overdue and age

- An invoice is overdue when `dueDate < today` in the company time zone and `balanceDue > 0`.
- The hourly sweep updates `ISSUED`/`PARTIALLY_PAID` to `OVERDUE` and writes one audit event per document.
- A payment on an overdue invoice moves it to `PARTIALLY_PAID` or `PAID`.
- The dashboard queries `due_date` and `balance_due` directly, so a one-hour sweep lag never hides a receivable.
- Ageing buckets (1–30, 31–60, 61–90, 90+) are phase 2 reporting; the data is already available.

---

## 8. Audit events

| Action | Event | Metadata |
|---|---|---|
| Create draft | `document.created` | type |
| Save draft | `document.saved` | version |
| Issue | `document.issued` | number, status, grand total (string) |
| Accept / reject / expire | `quotation.accepted`, … | note |
| Confirm / process / complete / cancel | `sales_order.confirmed`, … | reason for cancel |
| Deliver | `delivery_order.delivered` | delivered date |
| Payment | `payment.recorded` | payment, receipt, amount |
| Receipt void | `receipt.voided` | reason, reversed amount |
| Invoice void | `invoice.voided` | reason |
| Revision | `document.revised` | source and target ids |
| Conversion | `document.converted` | source, target, relation |
| PDF failure | `pdf.failed` | job id, safe error code |

Audit rows contain ids and status strings, never customer names or line descriptions.

---

## 9. Permissions

| Transition | Owner | Admin | Member | Viewer |
|---|---|---|---|---|
| Create/save draft | ✓ | ✓ | ✓ | — |
| Issue | ✓ | ✓ | ✓ | — |
| Accept/reject quotation | ✓ | ✓ | ✓ | — |
| Confirm/process/complete order | ✓ | ✓ | ✓ | — |
| Deliver | ✓ | ✓ | ✓ | — |
| Record payment | ✓ | ✓ | ✓ | — |
| Void invoice | ✓ | ✓ | — | — |
| Void receipt | ✓ | ✓ | — | — |
| Read | ✓ | ✓ | ✓ | ✓ |

The API checks the permission and the current status; the Angular guard only hides actions.

---

## 10. Acceptance tests

| # | Test | Expected |
|---|---|---|
| 1 | Issue a valid draft | Status, number, snapshot, revision and audit all present |
| 2 | Patch an issued document | `409 DOCUMENT_STATE_INVALID` |
| 3 | Accept a quotation twice | First `200`; second `409` with the current status |
| 4 | Cancel an order with an invoice | `409`, reason explains the downstream document |
| 5 | Deliver a cancelled delivery order | `409` |
| 6 | Pay an invoice partially, then fully | `PARTIALLY_PAID` then `PAID`; balance 0 |
| 7 | Void a paid invoice | `409`; void the receipts first |
| 8 | Void a receipt | Invoice reverts; payment `VOIDED`; audit recorded |
| 9 | Overdue sweep | Past-due invoices become `OVERDUE`; paid ones do not |
| 10 | Revise a sent quotation | New draft linked; source unchanged |
| 11 | Convert an accepted quotation | Target draft; source unchanged |
| 12 | Two concurrent issues | One succeeds, one `409`; one number consumed |
| 13 | Customer update after issue | Snapshot and PDF unchanged |
| 14 | Voided PDF | Watermarked, number retained, original archived |

---

## 11. Related docs

- [`0-DOCUMENT-MODEL.md`](0-DOCUMENT-MODEL.md) — fields, snapshots and relations
- [`06-DOCUMENT-NUMBERING.md`](06-DOCUMENT-NUMBERING.md) — number allocation inside the issue transaction
- [`09-DOCUMENT-CONVERSION.md`](09-DOCUMENT-CONVERSION.md) — downstream documents and guards
- [`10-PAYMENTS-AND-RECEIPTS.md`](10-PAYMENTS-AND-RECEIPTS.md) — payment and reversal transitions
- [`0-DATABASE.md`](0-DATABASE.md) §5 — transaction scopes
