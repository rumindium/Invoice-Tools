# 0 — Document Model

> The shared document aggregate behind every sales document: common fields, line items, immutable snapshots,
> money representation, numbering, lifecycle and the conversion graph.
> Elaborates [`README.md`](README.md) §4 and [`05-CALCULATIONS-AND-TAX.md`](05-CALCULATIONS-AND-TAX.md).
> Last updated: November 2026

---

## 1. Overview

Every sales document is one row in `documents` plus its `document_items`. A receipt is a document of type
`RECEIPT`, not a separate entity. This gives one editor, one numbering path, one PDF path, one snapshot format and
one audit trail.

```text
Document (common commercial identity)
├── DocumentItem[]            ordered lines, prices frozen at issue
├── DocumentRevision[]        full JSON snapshot per issued revision
├── DocumentRelation[]        quotation → order → delivery → invoice; credit/debit; receipt-of-payment
├── Payment[]                 only for INVOICE
└── AuditEvent[]              status, number, payment, void
```

A document is **editable while `DRAFT`** and **immutable once issued**. The only post-issue changes are a new
revision (which creates a new draft linked to the old one), a controlled void, or an adjustment document.

---

## 2. Document types

| Type | Enum | Label (en / id) | Purpose | Statuses |
|---|---|---|---|---|
| Quotation | `QUOTATION` | Quotation / Surat Penawaran Harga (SPH) | Offer goods or services with prices and terms | `DRAFT`, `SENT`, `ACCEPTED`, `REJECTED`, `EXPIRED` |
| Sales order | `SALES_ORDER` | Sales Order / Pesanan Penjualan | Record a confirmed customer order | `DRAFT`, `CONFIRMED`, `PROCESSING`, `COMPLETED`, `CANCELLED` |
| Delivery order | `DELIVERY_ORDER` | Delivery Order / Surat Jalan | Record goods delivered | `DRAFT`, `ISSUED`, `PARTIALLY_DELIVERED`, `DELIVERED`, `CANCELLED` |
| Invoice | `INVOICE` | Invoice / Faktur | Request payment | `DRAFT`, `ISSUED`, `PARTIALLY_PAID`, `PAID`, `OVERDUE`, `VOID` |
| Receipt | `RECEIPT` | Receipt / Kwitansi | Acknowledge money received | `ISSUED`, `VOID` |
| Credit note (P5) | `CREDIT_NOTE` | Credit Note / Nota Kredit | Reduce an invoice balance | `DRAFT`, `ISSUED`, `VOID` |
| Debit note (P5) | `DEBIT_NOTE` | Debit Note / Nota Debit | Increase an invoice balance | `DRAFT`, `ISSUED`, `VOID` |

The quotation label is a company setting: `QUOTATION`, `SPH`, or `BOTH`. It changes display text only; the type and
data are identical.

A **Statement of Account** is generated on demand from documents and payments. It is not stored as a `Document`
and has no lifecycle of its own. See [`13-CREDIT-DEBIT-NOTES-AND-SOA.md`](13-CREDIT-DEBIT-NOTES-AND-SOA.md).

---

## 3. Common fields

| Field | Type | Notes |
|---|---|---|
| `id` | `text` PK | `doc_` + ULID |
| `workspaceId` | `text` FK | Tenant scope; derived from the company, never from the client |
| `companyId` | `text` FK | Issuer |
| `templateId` | `text` FK NULL | Selected layout while draft; frozen into `templateSnapshot` at issue |
| `customerId` | `text` FK NULL | Null only for a one-time customer; the snapshot is still required at issue |
| `documentType` | enum | §2 |
| `status` | enum | Per-type set; transitions in [`07-DOCUMENT-LIFECYCLE.md`](07-DOCUMENT-LIFECYCLE.md) |
| `documentNumber` | `text` NULL | Null while draft; assigned atomically at issue |
| `sequencePeriod` | `text` NULL | Reset period key, e.g. `2026` or `2026-11` |
| `issueDate` | `date` | Defaults to today in the company time zone |
| `dueDate` | `date` NULL | Invoice only; must be ≥ issue date |
| `validUntil` | `date` NULL | Quotation only; must be ≥ issue date |
| `referenceNumber` | `text` NULL | Customer PO, contract or other external reference, ≤ 100 characters |
| `currencyCode` | `char(3)` | ISO 4217; one currency per document |
| `taxMode` | enum | `EXCLUSIVE` or `INCLUSIVE` |
| `discountType` | enum | Document-level discount: `NONE`, `PERCENT`, `AMOUNT` |
| `discountRate` | `Decimal(7,4)` NULL | 0–100 when `PERCENT` |
| `discountAmount` | `Decimal(19,4)` | Entered for `AMOUNT`, computed for `PERCENT` |
| `subtotal` | `Decimal(19,4)` | Sum of line net amounts after all discounts, **excluding tax** |
| `discountTotal` | `Decimal(19,4)` | Line discounts + document discount |
| `taxTotal` | `Decimal(19,4)` | Sum of line tax only; charges tax is separate |
| `shippingAmount` | `Decimal(19,4)` | Default 0 |
| `additionalCharges` | `Decimal(19,4)` | Default 0 |
| `chargesTaxRate` | `Decimal(7,4)` NULL | Null means charges are untaxed |
| `chargesTax` | `Decimal(19,4)` | Tax on shipping and additional charges; default 0 |
| `grandTotal` | `Decimal(19,4)` | `subtotal + taxTotal + shipping + additional + chargesTax` |
| `amountPaid` | `Decimal(19,4)` | Invoice and receipt only; default 0 |
| `balanceDue` | `Decimal(19,4)` | Invoice only; `grandTotal − amountPaid`, never negative |
| `notes` | `text` NULL | Visible on the document, ≤ 5,000 characters |
| `terms` | `text` NULL | Terms and conditions, ≤ 5,000 characters |
| `issuerSnapshot` | `jsonb` NULL | Frozen at issue (§5) |
| `customerSnapshot` | `jsonb` NULL | Frozen at issue (§5) |
| `templateSnapshot` | `jsonb` NULL | Frozen at issue (§5) |
| `calculationSnapshot` | `jsonb` NULL | Inputs, per-line results, totals and engine version |
| `pdfAssetId` | `text` FK NULL | Latest issued PDF artefact |
| `version` | `integer` | Optimistic lock for drafts; starts at 1 |
| `issuedAt` | `timestamptz` NULL | Set once |
| `voidedAt` | `timestamptz` NULL | Set by a controlled void |
| `voidReason` | `text` NULL | Required when voided, ≤ 500 characters |
| `createdBy` | `text` FK | Local user id |
| `deletedAt` | `timestamptz` NULL | Drafts only; issued documents are never deleted |
| `createdAt`, `updatedAt` | `timestamptz` | Database clock |

**Immutable after issue:** `documentNumber`, `issueDate`, `dueDate`, `validUntil`, `currencyCode`, `taxMode`,
`templateId`, all money columns, `notes`, `terms`, every line, every snapshot and `customerId`. A correction is a new revision, a
void, or a credit/debit note.

**Still writable after issue:** `pdfAssetId`, `amountPaid`, `balanceDue`, status transitions defined by the state
machine, and internal metadata (`updatedAt`).

---

## 4. Line items and charges

| Field | Type | Notes |
|---|---|---|
| `id` | `text` PK | `dit_` + ULID |
| `documentId` | `text` FK | Cascade within the draft transaction |
| `position` | `integer` | 0-based; contiguous after every save |
| `catalogItemId` | `text` FK NULL | Null for a custom line; deleting a catalog item never changes the line |
| `itemName` | `text` | 1–200 characters |
| `description` | `text` NULL | ≤ 2,000 characters |
| `quantity` | `Decimal(18,4)` | > 0, ≤ 1,000,000 |
| `unit` | `text` | `pcs`, `unit`, `hour`, `day`, `kg`, `lot`, `m`, `m²`, `session`, free text ≤ 20 |
| `unitPrice` | `Decimal(19,4)` | ≥ 0, ≤ 999,999,999,999.9999 |
| `discountType` | enum | `NONE`, `PERCENT`, `AMOUNT` |
| `discountRate` | `Decimal(7,4)` NULL | 0–100; required for `PERCENT` |
| `discountAmount` | `Decimal(19,4)` | Computed; for `AMOUNT`, the entered value, capped at the gross |
| `taxRate` | `Decimal(7,4)` | 0–100; 0 means no tax |
| `taxAmount` | `Decimal(19,4)` | Computed and stored at issue |
| `lineSubtotal` | `Decimal(19,4)` | Net after discounts, excluding tax |
| `lineTotal` | `Decimal(19,4)` | `lineSubtotal + taxAmount` |
| `createdAt` | `timestamptz` | |

**Charges** are not line items. Shipping and additional charges live on the document (`shippingAmount`,
`additionalCharges`) with one optional tax rate. This keeps the line table about priced goods and services and
avoids a fake quantity for a delivery fee.

Line order is user-controlled: add, edit, delete, drag to reorder. Reordering rewrites `position` for the whole
list in one statement. Removing a line renumbers the rest; positions are never sparse.

---

## 5. Snapshots

At issue, four JSON documents are written and never updated. They are the presentation truth; the numeric columns
are the queryable copy.

```json
{
  "schemaVersion": 1,
  "capturedAt": "2026-11-17T09:41:00.000Z",
  "issuer": {
    "companyId": "cmp_01J…",
    "legalName": "Rumindium Studio",
    "displayName": "Rumindium",
    "address": { "line1": "Jl. Contoh 12", "line2": "", "city": "Bandung", "province": "Jawa Barat", "postalCode": "40111", "countryCode": "ID" },
    "email": "billing@example.test",
    "phone": "+62 22 000 0000",
    "website": "https://example.test",
    "taxId": "00.000.000.0-000.000",
    "taxLabel": "NPWP",
    "logoAssetId": "ast_01J…",
    "bankAccounts": [{ "bank": "Contoh Bank", "accountName": "Rumindium Studio", "accountNumber": "0000000000" }],
    "signatory": { "name": "A. Person", "title": "Director", "showSignature": true }
  },
  "customer": {
    "customerId": "cus_01J…",
    "type": "BUSINESS",
    "name": "PT Pelanggan",
    "contactPerson": "B. Person",
    "email": "ap@customer.test",
    "phone": "+62 21 000 0000",
    "billingAddress": { "line1": "Jl. Pelanggan 1", "city": "Jakarta", "countryCode": "ID" },
    "shippingAddress": null,
    "taxId": "01.111.111.1-111.111"
  },
  "template": {
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
  },
  "calculation": {
    "engineVersion": "1.0.0",
    "currency": "IDR",
    "currencyMinorUnits": 0,
    "taxMode": "EXCLUSIVE",
    "rounding": "HALF_UP",
    "discount": { "type": "PERCENT", "rate": "5.0000", "amount": "45000.0000" },
    "lines": [
      {
        "position": 0,
        "itemName": "Design retainer",
        "quantity": "2.0000",
        "unitPrice": "500000.0000",
        "discountType": "PERCENT",
        "discountRate": "10.0000",
        "discountAmount": "100000.0000",
        "taxRate": "11.0000",
        "taxAmount": "94050.0000",
        "lineSubtotal": "855000.0000",
        "lineTotal": "949050.0000"
      }
    ],
    "totals": {
      "subtotal": "855000.0000",
      "discountTotal": "145000.0000",
      "taxTotal": "94050.0000",
      "shippingAmount": "25000.0000",
      "additionalCharges": "0.0000",
      "chargesTax": "0.0000",
      "grandTotal": "974050.0000",
      "amountInWords": "sembilan ratus tujuh puluh empat ribu lima puluh rupiah"
    }
  }
}
```

Rules:

1. `schemaVersion` is on every snapshot. A shape change increments it and ships a reader that accepts the old
   versions; snapshots are never rewritten in place.
2. The issuer snapshot references `logoAssetId`; the asset is immutable and retained while any snapshot points to
   it.
3. The customer snapshot is written even when `customerId` is null (one-time customer).
4. The template snapshot is written even for a system template, so a later template edit cannot change an old PDF.
5. The calculation snapshot stores inputs, rounded outputs and `engineVersion`; a later engine release can still
   explain an old document.
6. `amountInWords` is frozen; regenerating it with a newer language pack must not change an issued PDF.
7. Snapshots contain no session tokens, internal notes, cost prices or other fields not printed on the document.
8. A checksum over the canonical JSON is stored in the revision row; the PDF worker refuses a snapshot that does
   not match.
9. A receipt snapshot adds `receipt: { paymentId, method, reference }` so the receipt PDF can print how the money
   arrived without reading the payment table.

---

## 6. Money, quantities and rounding

| Rule | Value |
|---|---|
| Database money | `NUMERIC(19,4)`; Prisma `Decimal` |
| Database quantity | `NUMERIC(18,4)` |
| Percentage | `NUMERIC(7,4)`, range 0–100 |
| Client arithmetic | `decimal.js`, precision 34, `ROUND_HALF_UP` |
| API serialisation | Decimal values as JSON strings (`"1250000.0000"`), never numbers |
| Currency | ISO 4217; minor units from a fixed table (`IDR` 0, `USD`/`EUR`/`SGD` 2, `JPY` 0) |
| Rounding | `HALF_UP` at the stated step, never banker's rounding |
| Line tax | Rounded to currency minor units per line |
| Line net | Rounded to currency minor units per line |
| Grand total | Sum of rounded lines + charges, rounded to currency minor units once |
| Negative values | Only on credit notes; ordinary documents reject a negative total |

The full sequence, worked examples and invariants are in [`05-CALCULATIONS-AND-TAX.md`](05-CALCULATIONS-AND-TAX.md).
The stored equation every document must satisfy at minor-unit precision is:

```text
grandTotal = subtotal + taxTotal + shippingAmount + additionalCharges + chargesTax
subtotal   = Σ lineSubtotal          (after line and document discounts, excluding tax)
taxTotal   = Σ lineTax
balanceDue = grandTotal − amountPaid (invoice only, never negative)
```

`discountTotal` is informational and never subtracted from `grandTotal` again; the discounts are already inside
`subtotal`.

---

## 7. Numbering and lifecycle

- Drafts carry `documentNumber = null` and show a short reference such as `Draft · doc_01J…`.
- Issuing allocates a number from `document_number_sequences` inside the same transaction that freezes the
  document. See [`06-DOCUMENT-NUMBERING.md`](06-DOCUMENT-NUMBERING.md).
- A void keeps its number forever. Numbers are never reused, and a gap is acceptable.
- Status transitions are explicit domain events; `OVERDUE` is derived from `dueDate` and `balanceDue` by a
  scheduled sweep and recalculated on payment. See [`07-DOCUMENT-LIFECYCLE.md`](07-DOCUMENT-LIFECYCLE.md).
- Every transition writes `audit_events` with the previous status, the next status, the actor and, for voids, the
  reason.

---

## 8. Relations and conversion

```text
QUOTATION ──CONVERTED_TO──▶ SALES_ORDER ──CONVERTED_TO──▶ DELIVERY_ORDER
     │                            │                              │
     │                            └──────CONVERTED_TO────────────┴──▶ INVOICE
     │                                                                  │
     └──REVISED_FROM──▶ QUOTATION (new draft)                           ├──RECEIPT_FOR──▶ RECEIPT
                                                                        ├──CREDIT_OF──▶ CREDIT_NOTE
                                                                        └──DEBIT_OF───▶ DEBIT_NOTE
```

| Relation | Meaning | Cardinality |
|---|---|---|
| `CONVERTED_TO` | Source produced a new draft | A target has at most one source of this type |
| `REVISED_FROM` | New draft replaces a previous revision | A revision has one predecessor |
| `RECEIPT_FOR` | Receipt acknowledges a payment on an invoice | One receipt per payment |
| `CREDIT_OF` / `DEBIT_OF` | Adjustment against an invoice | Many notes per invoice |

The source is never modified by a conversion. The target copies commercial data, starts as `DRAFT`, and is
reviewed before issue. Duplicate conversion is blocked when an active target already exists, unless the caller
explicitly passes `allowDuplicate=true` with a reason (recorded in the audit event). Full mapping is in
[`09-DOCUMENT-CONVERSION.md`](09-DOCUMENT-CONVERSION.md).

---

## 9. Validation

| Rule | On draft | On issue |
|---|---|---|
| At least one line | optional | required |
| Company legal name and address | optional | required |
| Customer name (saved or one-time) | optional | required |
| Quantity > 0 | enforced | enforced |
| Unit price ≥ 0 | enforced | enforced |
| Line discount ≤ gross | enforced | enforced |
| Issue date valid, due/valid-until ≥ issue date | enforced | enforced |
| Currency is a known ISO code | enforced | enforced |
| Notes and terms within limits | enforced | enforced |
| Totals equal a fresh server calculation | advisory | required |
| Company, customer, catalog item belong to the workspace | enforced | enforced |
| Document status allows the action | — | enforced |
| Number can be allocated | — | required |

A draft may be incomplete, but it may never contain an invalid value (negative quantity, unknown currency, a line
from another workspace). Validation errors carry a field path such as `items.0.quantity`.

---

## 10. Limits

| Limit | Value | Reason |
|---|---|---|
| Lines per document | 200 | Editor responsiveness and PDF page bound |
| Item name / description | 200 / 2,000 characters | Storage and layout |
| Notes / terms | 5,000 characters each | Storage and layout |
| Reference number | 100 characters | Layout |
| Attachment size (logo) | 2 MB, 2048 × 2048 | Upload safety |
| PDF pages | 100 | Worker timeout and memory |
| Document number sequence | 999,999 per period | Pattern padding |
| Companies per workspace | 5 | Phase 1 product limit |
| Custom units | 20 characters | Layout |

---

## Related docs

- [`05-CALCULATIONS-AND-TAX.md`](05-CALCULATIONS-AND-TAX.md) — formulas, rounding, worked examples
- [`06-DOCUMENT-NUMBERING.md`](06-DOCUMENT-NUMBERING.md) — patterns and transactional allocation
- [`07-DOCUMENT-LIFECYCLE.md`](07-DOCUMENT-LIFECYCLE.md) — status machines and audit
- [`09-DOCUMENT-CONVERSION.md`](09-DOCUMENT-CONVERSION.md) — field mapping between document types
- [`0-DATABASE.md`](0-DATABASE.md) — the tables behind this model
- [`0-API.md`](0-API.md) — how the model is read and written
