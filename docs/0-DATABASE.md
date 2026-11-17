# 0 — Database

> PostgreSQL schema for Rumindium Invoice, managed with Prisma. Covers identity mirrors, workspaces, companies,
> customers, catalog, numbering, documents, snapshots, payments, jobs, audit, indexes, retention and migrations.
> Last updated: November 2026

---

## 1. Principles

| Rule | Detail |
|---|---|
| Engine | PostgreSQL 16; `citext` and `pg_trgm` extensions |
| Access | Prisma Client; raw SQL only through `Prisma.sql` with bound values, for locks and queue claims |
| Ids | `text` primary keys with typed prefixes (`doc_`, `cus_`…), ULID payloads |
| Time | `timestamptz` everywhere, default `now()`; business dates are `date`, not timestamps |
| Money | `numeric(19,4)`; quantity `numeric(18,4)`; percentage `numeric(7,4)` |
| Enums | Native PostgreSQL enums for document type, status, payment method, roles and job state |
| Deletes | Master data is archived (`archived_at`); drafts are soft-deleted (`deleted_at`); issued documents are never deleted |
| Tenant scope | `workspace_id` on every owned row; repository helpers add it to every predicate |
| Snapshots | `jsonb` for immutable presentation data; queryable money and relations stay in columns |
| Migrations | Prisma-generated SQL, reviewed, applied by `prisma migrate deploy` before the new app version starts |
| RLS | Not in phase 1; application scoping plus integration tests. Revisit when pooled connections are replaced by a per-request role |

---

## 2. Entity overview

```text
users (mirror of the Auth-Platform subject)
  │
  ├─< sessions
  │
  ├─< workspace_members >── workspaces ──< audit_events
  │                              │
  │                              ├─< companies ──┬─< customers
  │                              │               ├─< catalog_items
  │                              │               ├─< document_number_sequences
  │                              │               ├─< document_templates
  │                              │               └─< documents
  │                              │                      ├─< document_items
  │                              │                      ├─< document_relations
  │                              │                      ├─< document_revisions
  │                              │                      ├─< payments
  │                              │                      └─< print_tokens
  │                              ├─< assets
  │                              ├─< background_jobs
  │                              └─< idempotency_keys
```

`receipts` is not a table: a receipt is a `documents` row with `document_type = 'RECEIPT'`, linked from
`payments.receipt_document_id`.

---

## 3. Tables

### 3.1 `users`

| Column | Type | Notes |
|---|---|---|
| `id` | `text` PK | `usr_` + ULID |
| `subject` | `text` UNIQUE NOT NULL | OIDC `sub` from Auth-Platform |
| `email` | `citext` NOT NULL | Display and notification only; never an authorization key |
| `display_name` | `text` NOT NULL | |
| `created_at` | `timestamptz` | |
| `last_seen_at` | `timestamptz` NULL | Updated at most once per hour |

### 3.2 `sessions`

| Column | Type | Notes |
|---|---|---|
| `id` | `text` PK | `ses_` + ULID |
| `user_id` | `text` FK NOT NULL | |
| `token_hash` | `bytea` UNIQUE NOT NULL | SHA-256 of the cookie value; the raw token is never stored |
| `csrf_token_hash` | `bytea` NOT NULL | SHA-256 of the CSRF token in the readable cookie |
| `ip` | `inet` NULL | |
| `user_agent` | `text` NULL | Truncated to 300 characters |
| `created_at` | `timestamptz` | |
| `last_seen_at` | `timestamptz` | Sliding idle window |
| `expires_at` | `timestamptz` NOT NULL | Absolute expiry, 30 days after creation |

### 3.3 `workspaces` and `workspace_members`

| Table | Column | Type | Notes |
|---|---|---|---|
| `workspaces` | `id` | `text` PK | `wsp_` + ULID; a personal workspace derives from the user id |
| | `name` | `text` NOT NULL | 1–80 characters |
| | `owner_id` | `text` FK users | |
| | `auth_tenant_id` | `text` NULL UNIQUE | Auth-Platform tenant; null for a personal workspace |
| | `created_at`, `updated_at` | `timestamptz` | |
| `workspace_members` | `workspace_id`, `user_id` | PK | |
| | `role` | `workspace_role` | `OWNER`, `ADMIN`, `MEMBER`, `VIEWER` |
| | `created_at` | `timestamptz` | |

Phase 1 creates one `OWNER` member. The table and role checks exist so invitations can be added without a
migration of documents.

### 3.4 `companies`

| Column | Type | Notes |
|---|---|---|
| `id` | `text` PK | `cmp_` + ULID |
| `workspace_id` | `text` FK NOT NULL | |
| `legal_name` | `text` NOT NULL | Required to issue |
| `display_name` | `text` NULL | Falls back to `legal_name` |
| `logo_asset_id` | `text` FK assets NULL | Immutable once uploaded |
| `address_line1`, `address_line2` | `text` | |
| `city`, `province`, `postal_code` | `text` | |
| `country_code` | `char(2)` | ISO 3166-1 alpha-2 |
| `email`, `phone`, `website` | `text` NULL | |
| `tax_id` | `text` NULL | NPWP, VAT number, GST number |
| `tax_label` | `text` | Default `NPWP` for `ID`, else `Tax ID` |
| `bank_details` | `jsonb` | Array of `{ bank, accountName, accountNumber }`, max 5 |
| `default_currency` | `char(3)` | ISO 4217; default `IDR` |
| `default_locale` | `text` | `id-ID` or `en-US` |
| `time_zone` | `text` | IANA zone; default `Asia/Jakarta` |
| `quotation_label` | `quotation_label` | `QUOTATION`, `SPH`, `BOTH` |
| `default_tax_rate` | `numeric(7,4)` | 0 when the company is not tax-registered |
| `default_tax_mode` | `tax_mode` | `EXCLUSIVE` or `INCLUSIVE` |
| `default_payment_term_days` | `smallint` | Default 14 |
| `footer_text` | `text` NULL | ≤ 2,000 characters |
| `signatory_name`, `signatory_title` | `text` NULL | |
| `is_default` | `boolean` | One default per workspace |
| `archived_at` | `timestamptz` NULL | Archive only; documents keep working |
| `created_at`, `updated_at` | `timestamptz` | |

### 3.5 `customers`

| Column | Type | Notes |
|---|---|---|
| `id` | `text` PK | `cus_` + ULID |
| `workspace_id` | `text` FK NOT NULL | |
| `type` | `customer_type` | `INDIVIDUAL`, `BUSINESS` |
| `name` | `text` NOT NULL | 1–200 characters |
| `contact_person` | `text` NULL | |
| `email`, `phone` | `text` NULL | |
| `billing_address` | `jsonb` | `{ line1, line2, city, province, postalCode, countryCode }` |
| `shipping_address` | `jsonb` NULL | Same shape |
| `tax_id` | `text` NULL | |
| `notes` | `text` NULL | Internal, never printed |
| `default_payment_term_days` | `smallint` NULL | Overrides the company default |
| `archived_at` | `timestamptz` NULL | Archived customers keep their snapshots |
| `created_at`, `updated_at` | `timestamptz` | |

Duplicate detection is advisory: a trigram similarity query on `lower(name)` plus exact email or phone returns
possible matches; it never blocks a save.

### 3.6 `catalog_items`

| Column | Type | Notes |
|---|---|---|
| `id` | `text` PK | `itm_` + ULID |
| `workspace_id` | `text` FK NOT NULL | |
| `kind` | `catalog_kind` | `PRODUCT`, `SERVICE` |
| `name` | `text` NOT NULL | 1–200 characters |
| `sku` | `text` NULL | Unique per workspace when present |
| `description` | `text` NULL | Default line description |
| `unit` | `text` NOT NULL | Default `unit` |
| `unit_price` | `numeric(19,4)` | ≥ 0 |
| `tax_rate` | `numeric(7,4)` NULL | Null uses the company default |
| `is_active` | `boolean` | Inactive items stay in old documents |
| `archived_at` | `timestamptz` NULL | |
| `created_at`, `updated_at` | `timestamptz` | |

A partial unique index enforces `(workspace_id, lower(sku)) WHERE sku IS NOT NULL AND archived_at IS NULL`.

### 3.7 `document_number_sequences`

| Column | Type | Notes |
|---|---|---|
| `id` | `text` PK | `seq_` + ULID |
| `company_id` | `text` FK NOT NULL | |
| `document_type` | `document_type` | One sequence per type |
| `pattern` | `text` NOT NULL | e.g. `INV/{YYYY}/{SEQ:4}` |
| `reset_policy` | `sequence_reset` | `NEVER`, `YEARLY`, `MONTHLY` |
| `padding` | `smallint` | 1–8; also encoded in `{SEQ:n}` |
| `period_key` | `text` | `2026` or `2026-11`; the period of `next_value` |
| `next_value` | `integer` | The next number to allocate, starting at 1 |
| `last_issued_at` | `timestamptz` NULL | |
| `version` | `integer` | Incremented on every allocation |
| `created_at`, `updated_at` | `timestamptz` | |

Unique `(company_id, document_type)`. Allocation locks this row, rolls the period when `period_key` differs from
the current one, formats the number and increments `next_value`. See
[`06-DOCUMENT-NUMBERING.md`](06-DOCUMENT-NUMBERING.md) §5.

### 3.8 `document_templates`

| Column | Type | Notes |
|---|---|---|
| `id` | `text` PK | `tpl_` + ULID |
| `company_id` | `text` FK NULL | Null for a built-in template |
| `name` | `text` NOT NULL | |
| `slug` | `text` NOT NULL | `classic`, `modern`, `minimal`, or a company slug |
| `layout` | `text` NOT NULL | Built-in layout key |
| `paper_size` | `text` | `A4` or `LETTER` |
| `orientation` | `text` | `portrait` only in phase 1 |
| `accent_color` | `char(7)` | `#RRGGBB`, used for rules and headings |
| `logo_position` | `text` | `left`, `center`, `right`, `none` |
| `show_bank_details` | `boolean` | |
| `show_signature` | `boolean` | |
| `footer_text` | `text` NULL | ≤ 2,000 characters |
| `is_default` | `boolean` | One default per company |
| `archived_at` | `timestamptz` NULL | |
| `created_at`, `updated_at` | `timestamptz` | |

### 3.9 `documents`

| Group | Column | Type | Notes |
|---|---|---|---|
| Identity | `id` | `text` PK | `doc_` + ULID |
| | `workspace_id` | `text` FK NOT NULL | |
| | `company_id` | `text` FK NOT NULL | |
| | `customer_id` | `text` FK NULL | Null for a one-time customer |
| | `template_id` | `text` FK document_templates NULL | Draft layout; frozen at issue |
| | `document_type` | `document_type` | |
| | `status` | `document_status` | Per-type values, enforced by the domain |
| Number | `document_number` | `text` NULL | Assigned at issue |
| | `sequence_period` | `text` NULL | Period key of the allocated number |
| Dates | `issue_date` | `date` NOT NULL | |
| | `due_date`, `valid_until` | `date` NULL | |
| | `reference_number` | `text` NULL | |
| Commercial | `currency_code` | `char(3)` NOT NULL | |
| | `tax_mode` | `tax_mode` NOT NULL | |
| | `discount_type` | `discount_type` NOT NULL | Document-level discount |
| | `discount_rate` | `numeric(7,4)` NULL | |
| | `discount_amount` | `numeric(19,4)` NOT NULL | Default 0 |
| | `subtotal`, `discount_total`, `tax_total` | `numeric(19,4)` NOT NULL | Default 0 |
| | `shipping_amount`, `additional_charges` | `numeric(19,4)` NOT NULL | Default 0 |
| | `charges_tax_rate` | `numeric(7,4)` NULL | Null = untaxed charges |
| | `charges_tax` | `numeric(19,4)` NOT NULL | Default 0 |
| | `grand_total` | `numeric(19,4)` NOT NULL | |
| | `amount_paid`, `balance_due` | `numeric(19,4)` NOT NULL | Invoice and receipt |
| Text | `notes`, `terms` | `text` NULL | |
| Snapshots | `issuer_snapshot` | `jsonb` NULL | |
| | `customer_snapshot` | `jsonb` NULL | |
| | `template_snapshot` | `jsonb` NULL | |
| | `calculation_snapshot` | `jsonb` NULL | |
| Artefact | `pdf_asset_id` | `text` FK assets NULL | Latest issued PDF |
| Lifecycle | `version` | `integer` NOT NULL | Optimistic lock, starts at 1 |
| | `issued_at`, `voided_at` | `timestamptz` NULL | |
| | `void_reason` | `text` NULL | |
| | `created_by` | `text` FK users NOT NULL | |
| | `deleted_at` | `timestamptz` NULL | Drafts only |
| | `created_at`, `updated_at` | `timestamptz` | |

### 3.10 `document_items`

| Column | Type | Notes |
|---|---|---|
| `id` | `text` PK | `dit_` + ULID |
| `document_id` | `text` FK NOT NULL | `ON DELETE CASCADE` for drafts |
| `position` | `integer` NOT NULL | Contiguous from 0 |
| `catalog_item_id` | `text` FK NULL | `ON DELETE SET NULL` |
| `item_name` | `text` NOT NULL | |
| `description` | `text` NULL | |
| `quantity` | `numeric(18,4)` | |
| `unit` | `text` | |
| `unit_price` | `numeric(19,4)` | |
| `discount_type` | `discount_type` | `NONE`, `PERCENT`, `AMOUNT` |
| `discount_rate` | `numeric(7,4)` NULL | |
| `discount_amount` | `numeric(19,4)` | |
| `tax_rate` | `numeric(7,4)` | |
| `tax_amount` | `numeric(19,4)` | |
| `line_subtotal` | `numeric(19,4)` | Net, excluding tax |
| `line_total` | `numeric(19,4)` | Net + tax |
| `created_at` | `timestamptz` | |

Unique `(document_id, position)`. Draft saves replace the whole set in one transaction; issued documents are
never rewritten.

### 3.11 `document_relations`

| Column | Type | Notes |
|---|---|---|
| `id` | `text` PK | `rel_` + ULID |
| `source_document_id` | `text` FK NOT NULL | |
| `target_document_id` | `text` FK NOT NULL | |
| `relation_type` | `relation_type` | `CONVERTED_TO`, `REVISED_FROM`, `RECEIPT_FOR`, `CREDIT_OF`, `DEBIT_OF` |
| `created_at` | `timestamptz` | |
| `created_by` | `text` FK users | |

Unique `(target_document_id, relation_type)`: one receipt per payment document, one source per conversion type.
Both documents must belong to the same workspace; a trigger-free check in the service, covered by a test.

### 3.12 `document_revisions`

| Column | Type | Notes |
|---|---|---|
| `id` | `text` PK | `rev_` + ULID |
| `document_id` | `text` FK NOT NULL | |
| `revision_number` | `integer` NOT NULL | Starts at 1 |
| `snapshot` | `jsonb` NOT NULL | Issuer + customer + template + calculation, canonical JSON |
| `checksum` | `text` NOT NULL | SHA-256 of the canonical snapshot |
| `reason` | `text` NULL | Why the revision was created |
| `created_by` | `text` FK users | |
| `created_at` | `timestamptz` | |

Unique `(document_id, revision_number)`. Revisions are append-only.

### 3.13 `payments`

| Column | Type | Notes |
|---|---|---|
| `id` | `text` PK | `pay_` + ULID |
| `workspace_id` | `text` FK NOT NULL | |
| `invoice_id` | `text` FK documents NOT NULL | Must be an `INVOICE` |
| `receipt_document_id` | `text` FK documents UNIQUE NOT NULL | Must be a `RECEIPT` |
| `payment_date` | `date` NOT NULL | Not in the future |
| `amount` | `numeric(19,4)` NOT NULL | > 0 and ≤ invoice balance at recording time |
| `currency_code` | `char(3)` NOT NULL | Must equal the invoice currency |
| `method` | `payment_method` | `CASH`, `BANK_TRANSFER`, `CARD`, `OTHER` |
| `reference` | `text` NULL | Bank reference or transaction id, ≤ 100 characters |
| `notes` | `text` NULL | ≤ 1,000 characters |
| `status` | `payment_status` | `RECORDED`, `VOIDED` |
| `recorded_by` | `text` FK users | |
| `voided_at`, `voided_by`, `void_reason` | | Set by a receipt void |
| `created_at` | `timestamptz` | |

### 3.14 `assets`

| Column | Type | Notes |
|---|---|---|
| `id` | `text` PK | `ast_` + ULID |
| `workspace_id` | `text` FK NOT NULL | |
| `sha256` | `bytea` NOT NULL | Content hash |
| `mime` | `text` NOT NULL | Verified by magic bytes |
| `bytes` | `integer` NOT NULL | |
| `width`, `height` | `integer` NULL | Images only |
| `storage_key` | `text` NOT NULL | `ws/{workspaceId}/{sha256}.{ext}` |
| `created_at` | `timestamptz` | |

Unique `(workspace_id, sha256)`. An asset is deleted only when no company logo, document PDF or other reference
points to it for 7 days.

### 3.15 `print_tokens`

| Column | Type | Notes |
|---|---|---|
| `id` | `text` PK | `ptk_` + ULID |
| `token_hash` | `bytea` UNIQUE NOT NULL | SHA-256 of the URL token |
| `document_id` | `text` FK documents NOT NULL | |
| `revision_number` | `integer` | The issued revision, or 0 for a draft preview |
| `created_by` | `text` FK users | |
| `expires_at` | `timestamptz` NOT NULL | 5 minutes after creation |
| `revoked_at` | `timestamptz` NULL | Set when the job finishes or fails |
| `created_at` | `timestamptz` | |

### 3.16 `background_jobs`

| Column | Type | Notes |
|---|---|---|
| `id` | `text` PK | `job_` + ULID |
| `kind` | `text` NOT NULL | `pdf.generate`, `invoice.overdue-sweep`, `retention.sweep`, `integrity.check`, `backup.verify` |
| `payload` | `jsonb` NOT NULL | Ids and revision numbers only |
| `status` | `job_status` | `QUEUED`, `RUNNING`, `SUCCEEDED`, `FAILED`, `CANCELLED` |
| `attempts` | `smallint` | Starts 0 |
| `max_attempts` | `smallint` | Default 3 |
| `run_at` | `timestamptz` | Backoff target |
| `locked_at` | `timestamptz` NULL | |
| `locked_by` | `text` NULL | Worker instance id |
| `last_error` | `text` NULL | Sanitised, ≤ 1,000 characters |
| `created_at`, `finished_at` | `timestamptz` | |

Index `(status, run_at)` where status is `QUEUED`. A worker claims with
`FOR UPDATE SKIP LOCKED LIMIT 1`, sets `RUNNING`, and commits before doing the work.

### 3.17 `audit_events`

| Column | Type | Notes |
|---|---|---|
| `id` | `bigint` identity PK | Append-only |
| `workspace_id` | `text` NULL | Null for platform-level events |
| `actor_id` | `text` NULL | Null for system jobs |
| `action` | `text` NOT NULL | `document.issued`, `payment.recorded`, `receipt.voided`, … |
| `target_type`, `target_id` | `text` | `document`, `customer`, `company`, `payment` |
| `metadata` | `jsonb` | Ids, previous and next status, reason; never document content |
| `ip` | `inet` NULL | Retained 90 days, then nulled |
| `created_at` | `timestamptz` | |

### 3.18 `idempotency_keys`

| Column | Type | Notes |
|---|---|---|
| `id` | `text` PK | `idk_` + ULID |
| `user_id` | `text` FK users NOT NULL | |
| `route` | `text` NOT NULL | Method + path template |
| `key` | `text` NOT NULL | Client header, 8–128 characters |
| `request_hash` | `bytea` NOT NULL | Detects a reused key with a different body |
| `status_code` | `integer` NOT NULL | |
| `response_body` | `jsonb` NOT NULL | Stored response |
| `created_at`, `expires_at` | `timestamptz` | 24 hours |

Unique `(user_id, route, key)`.

---

## 4. Indexes

| Table | Index | Reason |
|---|---|---|
| `documents` | `(company_id, document_type, document_number) UNIQUE WHERE document_number IS NOT NULL` | No duplicate number |
| `documents` | `(company_id, created_at DESC, id DESC) WHERE deleted_at IS NULL` | Default list order |
| `documents` | `(company_id, issue_date DESC, id DESC) WHERE deleted_at IS NULL` | Issue-date pages |
| `documents` | `(company_id, status, due_date) WHERE balance_due > 0` | Outstanding and overdue |
| `documents` | `(company_id, customer_id, issue_date DESC)` | Customer history |
| `documents` | `(workspace_id, updated_at DESC)` | Dashboard recent list |
| `documents` | `gin (document_number gin_trgm_ops)` | Number search |
| `documents` | `gin (reference_number gin_trgm_ops)` | Reference search |
| `document_items` | `(document_id, position)` UNIQUE | Ordered lines |
| `customers` | `gin (lower(name) gin_trgm_ops)` | Name search and duplicate hints |
| `catalog_items` | `gin (lower(name) gin_trgm_ops)` | Catalog search |
| `catalog_items` | `(workspace_id, lower(sku)) UNIQUE WHERE sku IS NOT NULL` | SKU uniqueness |
| `payments` | `(invoice_id, payment_date, created_at)` | Invoice payment history |
| `audit_events` | `(workspace_id, created_at DESC)` | Audit list |
| `background_jobs` | `(status, run_at) WHERE status = 'QUEUED'` | Queue claim |
| `sessions` | `(token_hash) UNIQUE`; `(user_id)`; `(expires_at)` | Session lookup and cleanup |
| `print_tokens` | `(token_hash) UNIQUE`; `(expires_at)` | Print lookup and cleanup |
| `idempotency_keys` | `(user_id, route, key) UNIQUE`; `(expires_at)` | Replay and cleanup |

Every index is declared next to its model in `prisma/schema.prisma`. `EXPLAIN ANALYZE` for the document list,
dashboard and customer history is recorded in the load-test report before each release.

---

## 5. Write paths and transactions

| Operation | Transaction scope | Isolation |
|---|---|---|
| Save draft | Update document and `version`; delete and reinsert items; audit | Read committed; `version` in the `WHERE` |
| Issue document | Lock sequence row; allocate number; update document; insert revision; audit; enqueue PDF | Read committed; row lock serialises allocation |
| Convert document | Read source; insert target draft and items; insert relation; audit | Read committed |
| Record payment | Lock receipt sequence; lock invoice; insert payment; allocate receipt number; insert receipt document and item; update invoice; audits; enqueue receipt PDF | Read committed; sequence then invoice locks |
| Void receipt | Lock receipt and payment; mark both void; reverse invoice amounts; recompute status; audits | Read committed |
| Void invoice | Lock invoice; reject when `amount_paid > 0`; set void; audit | Read committed |
| Archive customer/item | Set `archived_at`; no document changes | Single statement |
| Delete draft | Set `deleted_at`; keep rows for 30 days; audit | Single transaction |
| Claim job | `SELECT … FOR UPDATE SKIP LOCKED`, set `RUNNING`, commit | Read committed |
| Overdue sweep | Select due invoices; update status; audit per document, batched 500 | Read committed, idempotent |

The numbering lock is always taken **before** the document row to keep lock order consistent between issue and
payment paths. A deadlock retry (one attempt) is implemented for `40P01`.

---

## 6. Retention

| Data | Retention | Removed by |
|---|---|---|
| Soft-deleted drafts | 30 days | `retention.sweep` |
| Issued documents | Until the workspace is deleted | Workspace deletion (manual, confirmed) |
| Archived companies/customers/items | While referenced by a document; otherwise 2 years | `retention.sweep` |
| Audit events | 12 months | `retention.sweep` |
| Audit IP addresses | 90 days | Nulled by `retention.sweep` |
| Sessions | Idle 14 days, absolute 30 days | `retention.sweep` and the session guard |
| Expired print tokens | 24 hours after expiry | `retention.sweep` |
| Finished jobs | 7 days | `retention.sweep` |
| Idempotency keys | 24 hours | `retention.sweep` |
| Unreferenced assets | 7 days after the last reference | `retention.sweep` + storage delete |
| Draft preview PDFs | 24 hours | Storage lifecycle rule |

Retention windows are configuration ([`0-CONFIG.md`](0-CONFIG.md) §6) and are enforced by one daily job.

---

## 7. Migrations

- Edit `prisma/schema.prisma`, then `npx prisma migrate dev --name <change>`; review the SQL and commit it.
- **Expand and contract:** add nullable columns and new tables in release N, switch reads in N+1, drop old
  columns in N+2. The previous app version must run against the new schema during a rolling deploy.
- Indexes on large tables are created in a separate migration with `CREATE INDEX CONCURRENTLY`; Prisma cannot run
  it inside the default transaction, so the migration is generated with `prisma migrate diff` and hand-edited.
- Backfills run in a bounded script (10,000 rows per batch) and are idempotent; they are not part of the schema
  migration.
- A migration never rewrites `document_revisions.snapshot` or any issued document's snapshot. A new snapshot
  version is read by application code, not migrated in place.
- CI runs `prisma migrate deploy` on an empty database and on a dump restored from the previous release, then runs
  the integration suite against both.

---

## 8. Local development

```bash
# PostgreSQL 16 must already be reachable at DATABASE_URL.
npm run db:migrate
npm run dev
```

Seed data creates two workspaces, two companies, five customers, eight catalog items and a small chain of
quotation → order → delivery → invoice → receipt. Emails use `example.test`; no real personal data is committed.

---

## Related docs

- [`0-DOCUMENT-MODEL.md`](0-DOCUMENT-MODEL.md) — what the document columns and snapshots mean
- [`06-DOCUMENT-NUMBERING.md`](06-DOCUMENT-NUMBERING.md) — the sequence allocation protocol
- [`10-PAYMENTS-AND-RECEIPTS.md`](10-PAYMENTS-AND-RECEIPTS.md) — payment and reversal transactions
- [`0-SECURITY.md`](0-SECURITY.md) — access checks and audit scope
- [`0-OPERATIONS.md`](0-OPERATIONS.md) — backup and restore
