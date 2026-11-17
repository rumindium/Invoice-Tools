# 01 — Company Profiles

> The seller identity printed on every document: legal name, logo, address, tax id, bank details, defaults and
> signatory, frozen into an immutable snapshot when a document is issued.
> Feature ID `F01` · queue: `api` · phase `P2` (an inline seller form ships in P1)
> Last updated: November 2026

---

## 1. Overview

A company profile is the issuer of a document. A workspace may hold several — a trading name and a legal entity,
two shops, or a freelancer's personal and registered identities. Every document belongs to exactly one company,
and that company's details at issue time are copied into `issuerSnapshot`.

Guest mode does not create a company row. The inline seller form is part of the local draft and is uploaded only
when the visitor saves to an account.

---

## 2. Fields

| Field | Required to issue | Notes |
|---|---|---|
| Legal name | Yes | 1–200 characters; the name on the document |
| Display name | No | Falls back to the legal name |
| Logo | No | PNG, JPEG or WebP; ≤ 2 MB; re-encoded to ≤ 2048 px |
| Address line 1, line 2 | Line 1 yes | |
| City, province, postal code | City yes | |
| Country | Yes | ISO 3166-1 alpha-2; default `ID` |
| Email, phone, website | No | Format validated; printed if present |
| Tax id | No | Label configurable (`NPWP`, `Tax ID`, `VAT`) |
| Bank details | No | Up to 5 accounts: bank, account name, account number |
| Default currency | Yes | ISO 4217; default `IDR` |
| Default locale | Yes | `id-ID` or `en-US` |
| Time zone | Yes | IANA zone; default `Asia/Jakarta` |
| Quotation label | Yes | `QUOTATION`, `SPH`, or `BOTH` |
| Default tax rate | Yes | 0–100, 4 decimals; default 0 |
| Default tax mode | Yes | `EXCLUSIVE` or `INCLUSIVE` |
| Default payment term | Yes | Days, 0–365; default 14 |
| Footer text | No | ≤ 2,000 characters; terms, thank-you note |
| Signatory name, title | No | Printed above the signature line |
| Default template | Yes | One built-in template |

---

## 3. Behaviour

### 3.1 Create and edit

- The first company in a workspace becomes the default.
- The company form is one page with sections: Identity, Address, Contact, Tax, Bank, Defaults, Signatory.
- A field is validated on blur and on save; errors appear next to the field, and a summary links to the first
  invalid one.
- Changing a company never changes an issued document. The next issued document uses the new values; the old
  snapshot stays.
- Archiving is the only delete. A company with issued documents cannot be removed; it disappears from pickers but
  its documents remain readable.

### 3.2 Logo

- Upload is a separate action; the image is validated by magic bytes, re-encoded, stripped of metadata and stored
  as an asset.
- The logo is immutable per asset id. Replacing it creates a new asset; old snapshots keep the old id.
- Removing the logo clears the reference; the asset is collected after it is unreferenced for 7 days.
- A logo is never fetched from a third-party URL. Paste-a-URL is not supported.

### 3.3 Defaults

Defaults are copied into a new document, then become editable per document:

| Default | Applied to |
|---|---|
| Currency | New quotation, order, delivery, invoice, receipt |
| Locale | Document language and amount-in-words language |
| Tax rate and mode | New lines and the document |
| Payment term | Invoice due date (`issueDate + days`) |
| Footer | Document terms when the template has no footer |
| Template | New documents |
| Quotation label | UI label for `QUOTATION` |

Changing a default does not mutate an existing draft; the draft keeps the values it was created with.

### 3.4 Signatory and bank details

Both are optional. The signature area prints the name and title above a line; no image signature is supported in
phase 1. Bank details print in the footer when the template enables them, with at most five accounts.

### 3.5 Snapshots

At issue, the issuer snapshot contains: company id, legal and display name, address, contact, tax id and label,
logo asset id, bank accounts, signatory and the document language. It does not contain internal notes, the
workspace id or the company's other documents.

---

## 4. UI

| Screen | Content |
|---|---|
| Company list | Cards with logo, name, default badge, document count; **Set as default**, **Archive** |
| Company form | Sections listed in §2; sticky **Save changes**; logo drop zone with preview |
| Company picker | In the document editor header; archived companies excluded |
| Company preview | The document header block rendered with the current values |

There is no separate "branding" screen; the logo and accent live with the company and its template.

---

## 5. Limits

| Limit | Value |
|---|---|
| Companies per workspace | 5 (phase 1) |
| Logo size | 2 MB |
| Logo dimensions | 2048 × 2048 maximum after decode |
| Bank accounts | 5 |
| Footer | 2,000 characters |
| Tax id | 50 characters |

---

## 6. Acceptance tests

| # | Test | Expected |
|---|---|---|
| 1 | Create a company with only a legal name | Saved as incomplete; cannot issue until address and country are set |
| 2 | Upload a 3 MB PNG | `413 PAYLOAD_TOO_LARGE`, no asset stored |
| 3 | Upload an SVG renamed to `.png` | Rejected by magic bytes |
| 4 | Change the legal name after issuing an invoice | Old invoice snapshot and PDF unchanged; new draft uses the new name |
| 5 | Set a second company as default | New documents default to it; existing drafts unchanged |
| 6 | Archive a company with documents | Hidden from pickers; its documents still open |
| 7 | Delete the only company with documents | `409 COMPANY_IN_USE` |
| 8 | Replace the logo | New asset id; old snapshot still renders the old logo |
| 9 | Two workspaces | Each sees only its own companies; a foreign id is `404` |
| 10 | Guest seller form | No company row is created until the draft is saved to an account |

---

## 7. Related docs

- [`0-DOCUMENT-MODEL.md`](0-DOCUMENT-MODEL.md) §5 — the issuer snapshot
- [`14-DOCUMENT-TEMPLATES.md`](14-DOCUMENT-TEMPLATES.md) — where the logo and accent are placed
- [`0-API.md`](0-API.md) §3.4 — company routes
- [`04-DOCUMENT-EDITOR.md`](04-DOCUMENT-EDITOR.md) — company selection while editing
