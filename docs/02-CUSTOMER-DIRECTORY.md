# 02 — Customer Directory

> Reusable buyers: individuals and businesses, billing and shipping addresses, contact details, tax ids, payment
> terms and a snapshot on every issued document.
> Feature ID `F02` · queue: `api` · phase `P2` (a one-time customer ships in P1)
> Last updated: November 2026

---

## 1. Overview

The customer directory removes retyping and keeps a consistent buyer identity across quotations, orders, delivery
notes, invoices and receipts. A document may use a saved customer or a one-time customer; either way, the details
printed on an issued document are a frozen snapshot.

A one-time customer is not saved to the directory. It exists in the document draft and, after issue, only inside
the snapshot. A "Save to customers" action is offered after the document is saved; it is never automatic.

---

## 2. Fields

| Field | Required to issue | Notes |
|---|---|---|
| Type | Yes | `INDIVIDUAL` or `BUSINESS`; affects the label only |
| Name | Yes | 1–200 characters; business name or person name |
| Contact person | No | Useful for a business buyer |
| Email | No | Format validated; used for display only in phase 1 |
| Phone | No | Free text, ≤ 40 characters |
| Billing address | Yes | Line 1, city, country; line 2, province, postal code optional |
| Shipping address | No | Same shape; "same as billing" toggle |
| Tax id | No | NPWP, VAT, GST; ≤ 50 characters |
| Notes | No | Internal, never printed |
| Default payment term | No | Days; overrides the company default for new invoices |

---

## 3. Behaviour

### 3.1 Create, edit, archive

- Create from the directory or inline from the document editor. The inline form saves the customer and selects it
  in one action.
- Edit updates the directory record only. Issued documents keep their snapshot; drafts that reference the customer
  pick up the new values when reopened, unless the draft already has an explicit one-time customer.
- Archive hides the customer from pickers and search by default; it remains visible with
  `includeArchived=true` and its documents stay readable.
- Deleting a customer with documents is not offered. Archive is the only removal.

### 3.2 Duplicate hints

Before saving, the API searches for a similar name (trigram), the same email or the same phone within the
workspace and returns up to three hints:

```json
{
  "duplicateHints": [
    { "id": "cus_01J…", "name": "PT Pelanggan", "email": "ap@customer.test", "reason": "same email" }
  ]
}
```

The save is not blocked. The UI shows "Did you mean…?" and lets the user open the existing record or continue.
This prevents most accidental duplicates without creating a merge workflow in phase 1.

### 3.3 One-time customers

- Available in guest mode and in the account editor.
- Not written to `customers`; stored in `customerSnapshot` at issue.
- A one-time customer does not appear in search, statements or the customer list.
- After a successful save, the editor offers "Save this customer" with the same fields prefilled.

### 3.4 Payment terms and statements

- `defaultPaymentTermDays` prefills an invoice due date. A document may override it.
- The customer detail page lists recent documents and, from P5, a link to the statement of account.
- Statements are computed from documents and payments, never from a stored customer balance.

### 3.5 Snapshots

At issue, `customerSnapshot` contains: customer id (or null), type, name, contact person, email, phone, billing
address, shipping address and tax id. It never contains internal notes, the workspace id or the customer's other
documents.

---

## 4. UI

| Screen | Content |
|---|---|
| Customer list | Search, type filter, archived toggle, columns: name, contact, email, phone, last document |
| Customer detail | Header with name and type; contact and address cards; recent documents; **New invoice** |
| Customer form | One page; address sections; **Save** and **Save and create invoice** |
| Inline picker | Searchable select with **Create new**; shows name and email |
| One-time form | Collapsible section in the editor with a "Save to customers" action after save |

Search is case-insensitive and matches name, contact, email and phone. The list is cursor-paginated and shows a
skeleton while loading.

---

## 5. Limits

| Limit | Value |
|---|---|
| Name | 200 characters |
| Contact person | 120 characters |
| Email | 254 characters |
| Phone | 40 characters |
| Address line | 200 characters |
| Notes | 1,000 characters |
| Duplicate hints | 3 |
| Page size | 100 |

---

## 6. Acceptance tests

| # | Test | Expected |
|---|---|---|
| 1 | Create a business customer with billing only | Saved; invoice uses billing as shipping when the toggle is on |
| 2 | Same email as an existing customer | Duplicate hint returned; save succeeds |
| 3 | Edit a customer after issuing an invoice | Invoice snapshot and PDF unchanged |
| 4 | Archive a customer | Hidden from the picker; its documents still open |
| 5 | Use a one-time customer | No `customers` row; snapshot present on issue |
| 6 | Search by phone fragment | Matching customer returned |
| 7 | Foreign workspace id | `404`, no data leaked |
| 8 | Customer with a 300-character name | Validation error with the field path |
| 9 | Save a one-time customer to the directory | A new customer row; the draft now references it |
| 10 | Customer page with 0 documents | Empty state with **Create invoice** |

---

## 7. Related docs

- [`0-DOCUMENT-MODEL.md`](0-DOCUMENT-MODEL.md) §5 — the customer snapshot
- [`0-API.md`](0-API.md) §3.5 — customer routes
- [`10-PAYMENTS-AND-RECEIPTS.md`](10-PAYMENTS-AND-RECEIPTS.md) — invoices and balances
- [`13-CREDIT-DEBIT-NOTES-AND-SOA.md`](13-CREDIT-DEBIT-NOTES-AND-SOA.md) — customer statements
