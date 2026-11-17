# 06 — Document Numbering

> Configurable number patterns, per-company sequences, yearly or monthly reset, transactional allocation and the
> rules that make a number permanent.
> Feature ID `F06` · queue: `api` · phase `P2` (local preview numbers in P1)
> Last updated: November 2026

---

## 1. Overview

A document number is a business identity, not a database id. It is allocated exactly once, inside the transaction
that issues the document, and it is never reused — not after a void, not after a revision, not after a deletion.

```text
draft ──(issue)──▶ sequence row locked ──▶ next value ──▶ formatted number ──▶ document.documentNumber
```

Drafts have no official number. Guest documents have a local reference that is clearly not a reserved number.

---

## 2. Scope

- One sequence per **company** and **document type**.
- Quotation/SPH share one sequence; the label does not create a second counter.
- A workspace with two companies has independent counters, so two invoices may legitimately share a number if
  the companies are separate legal issuers.
- A company created later starts its own sequences at 1.

| Type | Default pattern | Example |
|---|---|---|
| Quotation / SPH | `QUO/{YYYY}/{SEQ:4}` | `QUO/2026/0042` |
| Sales order | `SO/{YYYY}/{SEQ:4}` | `SO/2026/0017` |
| Delivery order | `DO/{YYYY}/{SEQ:4}` | `DO/2026/0009` |
| Invoice | `INV/{YYYY}/{SEQ:4}` | `INV/2026/0007` |
| Receipt | `RCPT/{YYYY}/{SEQ:4}` | `RCPT/2026/0003` |
| Credit note (P5) | `CN/{YYYY}/{SEQ:4}` | `CN/2026/0001` |
| Debit note (P5) | `DN/{YYYY}/{SEQ:4}` | `DN/2026/0001` |

A company may choose `SPH/{YYYY}/{SEQ:4}` for quotations; the sequence is the same.

---

## 3. Pattern language

| Token | Meaning | Example for 17 November 2026 |
|---|---|---|
| `{YYYY}` | Four-digit year in the company time zone | `2026` |
| `{YY}` | Two-digit year | `26` |
| `{MM}` | Two-digit month | `11` |
| `{DD}` | Two-digit day | `17` |
| `{SEQ:n}` | Sequence padded to `n` digits (1–8) | `{SEQ:4}` → `0042` |
| anything else | Literal text | `INV/`, `-`, `.`, `SPH` |

Rules:

- The pattern must contain `{SEQ:n}` exactly once.
- `{SEQ:n}` may appear anywhere; the padding is also stored in `padding` for validation.
- The pattern is 1–60 characters after token expansion, and only letters, digits, `/`, `-`, `.`, `_` and spaces.
- No `/` at the start or end; no consecutive separators.
- The preview must be unique within the company, type and current period before a pattern change is saved.
- Changing a pattern affects only future numbers. Issued numbers and their snapshots are untouched.

---

## 4. Reset policy

| Policy | Period key | Behaviour |
|---|---|---|
| `NEVER` | `ALL` | The sequence grows forever |
| `YEARLY` | `2026` | Resets to 1 on 1 January, company time zone |
| `MONTHLY` | `2026-11` | Resets to 1 on the first of each month |

The period is calculated from the issue timestamp in the company's IANA time zone, not from the server's UTC date.
A document issued at 00:30 Jakarta time on 1 January gets the new year's sequence.

At reset, the old `next_value` is discarded; the new period starts at 1. A gap at the end of a year is normal.

---

## 5. Allocation protocol

Allocation is part of the issue transaction:

```sql
BEGIN;

-- 1. Lock the sequence row for this company and type.
SELECT id, pattern, reset_policy, padding, period_key, next_value
FROM document_number_sequences
WHERE company_id = $1 AND document_type = $2
FOR UPDATE;

-- 2. Compute the current period key in the company time zone.
--    If it differs from period_key, reset next_value to 1 and store the new key.

-- 3. Allocate and advance.
UPDATE document_number_sequences
SET next_value = next_value + 1,
    period_key = $3,
    last_issued_at = now(),
    version = version + 1
WHERE id = $4;

-- 4. Format the number in application code from the locked values.

-- 5. Update the document and write snapshots, revision and audit.
UPDATE documents
SET document_number = $5,
    status = 'ISSUED',
    issued_at = now(),
    ...
WHERE id = $6 AND status = 'DRAFT';

COMMIT;
```

Why this is safe:

- `FOR UPDATE` serialises concurrent issues for the same company and type.
- The sequence lock is taken **before** the document row, matching the payment path's lock order and avoiding a
  deadlock.
- A unique index on `(company_id, document_type, document_number)` is the backstop; a duplicate surfaces as
  `409 DUPLICATE_DOCUMENT_NUMBER` and the request is retried once.
- The document status check prevents a second issue from consuming another number.
- The whole operation is one transaction; a failure leaves both the sequence and the document unchanged.

The API never allocates a number for a draft, a preview, a PDF request or a “next number” lookup. The preview route
computes the next value read-only and labels it **“next, not reserved”**.

---

## 6. Concurrency

| Test | Expected |
|---|---|
| 50 parallel issues, same company/type | 50 unique numbers, contiguous |
| 50 parallel issues across two companies | Each company has its own contiguous range |
| Issue retried after a timeout with the same idempotency key | One number, same response |
| Issue without idempotency key, two clicks | Second request `409 DOCUMENT_STATE_INVALID`, no second number |
| Year rollover at 00:00 company time | New period starts at 1; December numbers are not reused |
| Pattern change mid-year | Future numbers follow the new pattern; old numbers unchanged; preview uniqueness checked |

---

## 7. Void, revision and deletion

| Event | Number behaviour |
|---|---|
| Void invoice/receipt | Number retained, status `VOID`; never returned to the pool |
| Revise a quotation | New draft gets a new number when issued; the original keeps its number |
| Delete a draft | No number was allocated; nothing to release |
| Convert a document | The new document gets its own type sequence; the source number is referenced in the relation |
| Workspace deletion | Numbers disappear with the documents; no reuse across workspaces |

A gap in a sequence is acceptable and expected. Renumbering to fill gaps is forbidden because it would rewrite
issued documents.

---

## 8. Guest and local numbers

- Guest drafts use a local counter in IndexedDB: `DRAFT-0003`, scoped per document type and device.
- The UI labels it **“Local reference — not a reserved document number”** on the preview and in the PDF.
- Saving a guest draft to an account discards the local reference; the server assigns the official number at
  issue.
- A guest cannot request a specific number, and the local counter is not synchronized across devices.

---

## 9. Configuration and UI

| Screen | Content |
|---|---|
| Settings → Numbering | One row per type: pattern, reset policy, next number, last issued |
| Pattern editor | Token buttons, live preview with the next three values, validation messages |
| Document editor | Draft shows “Draft”; issued shows the number with a copy action |
| Preview | “Next number INV/2026/0013 (not reserved)” |

Changing numbering requires the `admin` role and is audited with the old and new pattern.

---

## 10. Limits

| Limit | Value |
|---|---|
| Pattern length | 60 characters |
| Sequence padding | 1–8 digits |
| Sequence per period | 999,999 |
| Patterns per company/type | 1 active |
| Preview lookahead | 3 numbers |

At 999,999 the issue answers `422 DOCUMENT_LIMIT_EXCEEDED` and asks the user to change the pattern or reset policy;
it never wraps or reuses.

---

## 11. Acceptance tests

| # | Test | Expected |
|---|---|---|
| 1 | Issue the first invoice | `INV/2026/0001` |
| 2 | Issue 50 in parallel | 50 unique contiguous numbers |
| 3 | Void and issue another | The void keeps its number; the new one is next |
| 4 | Change the pattern to `INV-{YYYY}-{SEQ:5}` | Next number follows it; old numbers unchanged |
| 5 | Preview the next number | Shows the value but does not consume it |
| 6 | Two companies | Independent sequences |
| 7 | Year rollover | Sequence resets to 1 |
| 8 | Monthly reset | Sequence resets on the first of the month |
| 9 | Pattern without `{SEQ}` | Validation error |
| 10 | Pattern that collides with the current period | Rejected with a clear message |
| 11 | Guest draft | `DRAFT-0003`, clearly labelled |
| 12 | Duplicate number from a forced insert | Unique constraint rejects; no second issue |

---

## 12. Related docs

- [`0-DOCUMENT-MODEL.md`](0-DOCUMENT-MODEL.md) §7 — numbering in the aggregate
- [`07-DOCUMENT-LIFECYCLE.md`](07-DOCUMENT-LIFECYCLE.md) — the issue transaction
- [`0-DATABASE.md`](0-DATABASE.md) §3.7 — sequence table and lock
- [`0-API.md`](0-API.md) §3.7 — numbering routes
