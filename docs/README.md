# Rumindium Invoice — Implementation Documentation Set

> A web-based sales-document generator for freelancers, shops, service providers and small companies.
> Quotations/SPH, sales orders, delivery orders, invoices, receipts, and the adjustments that follow them.
> Architecture, document model, API, database, operations, and one document per feature family.
> Structure mirrors [`Rumindium-Diagram/docs`](../../Rumindium-Diagram/docs/README.md) and
> [`Rumindium-PDF/docs`](../../Rumindium-PDF/docs/README.md).
> Last updated: November 2026

---

## 1. What this product is

A fast, approachable document workspace. A visitor can build a professional quotation or invoice without an
account and print it; an account adds saved companies, customers, a product catalog, reserved document numbers,
server-generated PDFs, conversion between documents, and payment tracking.

```text
CREATE (guided editor)  →  ISSUE (number + immutable snapshot)  →  CONVERT (next document)  →  TRACK (status, payments)
```

The product is **not** a full accounting or ERP system. It does not keep a general ledger, reconcile bank accounts,
file taxes, value inventory, process card payments or provide legally binding e-signatures. It prepares and tracks
sales documents; the user validates legal, tax and commercial requirements.

| Aspect | Decision |
|---|---|
| Runtime | Node.js 22 LTS; npm 10 workspaces |
| Web | Angular (current stable), standalone components, signals, typed reactive forms, SSR + prerender |
| API | NestJS, REST under `/api/v1`, class-validator DTOs, Swagger/OpenAPI |
| Database | PostgreSQL 16 |
| ORM | Prisma; money and quantities as `Decimal`, never binary floating point |
| Identity | Auth-Platform (platform SSO or OIDC), plus a local stub for development |
| Sessions | Opaque token in an HttpOnly cookie, hashed and stored in PostgreSQL |
| Jobs | A PostgreSQL job table claimed with `FOR UPDATE SKIP LOCKED`; no Redis in phase 1 |
| Object storage | Local disk in development, S3-compatible in staging and production |
| PDF | Chromium (Playwright) printing the application's own `/print` route in a worker |
| Testing | Vitest, Angular TestBed, Supertest, Playwright, axe-core |
| Tooling | ESLint 9 + angular-eslint, Prettier 3, Docker Compose, GitHub Actions |
| Deployment | Docker Compose on one host, then split API/worker, then managed PostgreSQL and object storage |

**Status: specification with P0 scaffold.** The repository now contains the runnable API, Angular shell, Prisma schema
and initial migration. Document features and the later deployment design described here are not implemented yet;
where the documents say "implemented", they mean a planned phase boundary unless the P0 scaffold says otherwise.

---

## 2. How to read this set

```text
START HERE
   │
   ├── README.md                          ← you are here: scope, feature matrix, canonical values
   ├── 0-ARCHITECTURE.md                  ← topology, request lifecycles, ADRs, failure domains
   │      ├── 0-DOCUMENT-MODEL.md         ← the sales-document aggregate, snapshots, numbering, conversion graph
   │      ├── 0-DATABASE.md               ← tables, indexes, transactions, retention
   │      └── 0-API.md                    ← the REST contract everything implements
   │
   ├── BUILD                                    ├── RUN
   │   ├── 0-FOLDER-STRUCTURE.md                ├── 0-TESTING.md
   │   ├── 0-CONFIG.md                          ├── 0-CICD.md
   │   ├── 0-UI-DESIGN.md                       ├── 0-OPERATIONS.md
   │   └── 0-WEB-AND-SEO.md                     └── 0-SECURITY.md
   │
   ├── 0-DEV-TO-PRODUCTION.md   ← setup, phases P0–P5, deployment stages S1–S3, readiness gate
   │
   ├── FEATURES (one document each, same section layout)
   │   ├── 01-COMPANY-PROFILES.md
   │   ├── 02-CUSTOMER-DIRECTORY.md
   │   ├── 03-PRODUCT-AND-SERVICE-CATALOG.md
   │   ├── 04-DOCUMENT-EDITOR.md
   │   ├── 05-CALCULATIONS-AND-TAX.md
   │   ├── 06-DOCUMENT-NUMBERING.md
   │   ├── 07-DOCUMENT-LIFECYCLE.md
   │   ├── 08-PDF-AND-PRINT.md
   │   ├── 09-DOCUMENT-CONVERSION.md
   │   ├── 10-PAYMENTS-AND-RECEIPTS.md
   │   ├── 11-DASHBOARD-AND-SEARCH.md
   │   ├── 12-GUEST-MODE-AND-ACCOUNTS.md
   │   ├── 13-CREDIT-DEBIT-NOTES-AND-SOA.md
   │   └── 14-DOCUMENT-TEMPLATES.md
   │
   └── Auth integration: 12-GUEST-MODE-AND-ACCOUNTS.md §6–§8 and 0-SECURITY.md §5
```

Reading order for a new engineer: `README` → `0-ARCHITECTURE` → `0-DOCUMENT-MODEL` → `0-DEV-TO-PRODUCTION`
(phases P0–P1) → `05-CALCULATIONS-AND-TAX` → the feature document being implemented.

---

## 3. Feature matrix

Phase tags map to [`0-DEV-TO-PRODUCTION.md`](0-DEV-TO-PRODUCTION.md) §4. "Queue" is where the work runs:
`client` (browser), `api` (request path), `worker` (background), `full` (all three).

| ID | Feature | Doc | Summary | Queue | Phase |
|---|---|---|---|---|---|
| F01 | Company profiles | [01](01-COMPANY-PROFILES.md) | Seller identity, logo, addresses, tax id, bank details, defaults, signatory, snapshots | api | P2 (inline seller form in P1) |
| F02 | Customer directory | [02](02-CUSTOMER-DIRECTORY.md) | Individuals and businesses, billing/shipping addresses, duplicate hints, archive, snapshots | api | P2 (one-time customer in P1) |
| F03 | Product & service catalog | [03](03-PRODUCT-AND-SERVICE-CATALOG.md) | Reusable items, units, prices, tax treatment, archive, custom lines | api | P2 |
| F04 | Document editor | [04](04-DOCUMENT-EDITOR.md) | Guided creation, line items, discounts, charges, notes, terms, preview, save/issue | client | P1 |
| F05 | Calculations & tax | [05](05-CALCULATIONS-AND-TAX.md) | Decimal money, discounts, tax-inclusive/exclusive, rounding, amount in words, invariants | client + domain | P1 |
| F06 | Document numbering | [06](06-DOCUMENT-NUMBERING.md) | Patterns, yearly/monthly reset, transactional allocation, gaps, void rules | api | P2 (local preview numbers in P1) |
| F07 | Document lifecycle | [07](07-DOCUMENT-LIFECYCLE.md) | Status machines per type, issue snapshots, revisions, void, overdue, audit | api | P1 (draft/issue), P3 (full) |
| F08 | PDF & print | [08](08-PDF-AND-PRINT.md) | A4/Letter layouts, print route, worker rendering, guest browser print, parity | client + worker | P1 (browser), P2 (server) |
| F09 | Document conversion | [09](09-DOCUMENT-CONVERSION.md) | Quotation → order → delivery → invoice, source links, duplicate guards | api | P3 |
| F10 | Payments & receipts | [10](10-PAYMENTS-AND-RECEIPTS.md) | Manual payments, partial payments, receipts, balance, void/reversal | api | P4 |
| F11 | Dashboard & search | [11](11-DASHBOARD-AND-SEARCH.md) | Receivables, overdue, quotations, recent documents, filters, cursor search | api | P3 (search), P4 (receivables) |
| F12 | Guest mode & accounts | [12](12-GUEST-MODE-AND-ACCOUNTS.md) | Local drafts, privacy, sign-in, workspace, roles, draft import, deletion | full | P1 (guest), P2 (accounts) |
| F13 | Credit/debit notes & SOA | [13](13-CREDIT-DEBIT-NOTES-AND-SOA.md) | Invoice adjustments and customer statements with running balance | api | P5 |
| F14 | Document templates | [14](14-DOCUMENT-TEMPLATES.md) | Built-in layouts, accent, paper size, footer, signature, template snapshots | api + worker | P2 (built-ins), P5 (config) |

**Out of scope for the first production release** (documented, not scheduled): general ledger, bank feeds, tax
filing, inventory valuation, payment-gateway processing, e-signature infrastructure, automatic legal/tax advice,
purchase orders, payroll and POS. See [`0-DEV-TO-PRODUCTION.md`](0-DEV-TO-PRODUCTION.md) §7.

---

## 4. Document chain and phase scope

```text
P1  Quotation / SPH ─┐
    Invoice           ├── standalone, guest-capable, print-ready
    Receipt / Kwitansi┘
P3  Quotation ──▶ Sales Order ──▶ Delivery Order ──▶ Invoice
P4  Invoice ──▶ Payment ──▶ Receipt; balances and receivables
P5  Invoice ──▶ Credit Note / Debit Note; Statement of Account
```

A document is an immutable commercial snapshot once issued. Later changes to a company, customer, catalog item or
template never rewrite it; corrections use a revision, a void-and-reissue, or an adjustment document.

SPH (*Surat Penawaran Harga*) and Quotation are one document type with a configurable label. The company chooses
`Quotation`, `SPH`, or `Quotation / SPH`, and the UI follows the locale.

---

## 5. Architecture at a glance

```text
                     PUBLIC INTERNET
                           │
                    TLS · HSTS · rate limit
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
      ┌───────────────┐         ┌───────────────┐
      │ web (Angular  │  /api   │ api (NestJS)  │
      │ SSR/prerender)├────────▶│ REST, auth,   │
      │ public + app  │         │ documents     │
      └───────┬───────┘         └───┬───────┬───┘
              │  /print/:token      │       │
              │  (Chromium)         │       │
              ▼                     ▼       ▼
      ┌───────────────┐     ┌────────────┐ ┌──────────────┐
      │ worker        │     │ PostgreSQL │ │ object store │
      │ PDF, sweeps   │◀───▶│ documents, │ │ logos, PDFs  │
      │ (Playwright)  │     │ jobs, audit│ │ (S3/local)   │
      └───────────────┘     └────────────┘ └──────────────┘
```

No Redis, message broker or microservice in phase 1. The API is a modular NestJS monolith; the worker claims rows
from `background_jobs`; PostgreSQL is the only source of truth. See [`0-ARCHITECTURE.md`](0-ARCHITECTURE.md) §3.

---

## 6. Data ownership

| Data | Owner | Where it lives | Retention |
|---|---|---|---|
| Company, customer and catalog records | Workspace | PostgreSQL | Until archived; archived rows kept while referenced |
| Documents, line items, relations, revisions | Workspace | PostgreSQL | Issued documents until workspace deletion; drafts soft-deleted 30 days |
| Issuer, customer, template and calculation snapshots | Workspace | PostgreSQL `jsonb` on the document | Same as the document |
| Logos and generated PDFs | Workspace | S3-compatible bucket (local disk in development) | PDFs until the document is deleted; logos while referenced |
| Payments and receipts | Workspace | PostgreSQL | Same as the invoice |
| Audit events | Workspace | PostgreSQL | 12 months, then deleted |
| Sessions | User | PostgreSQL | Idle 14 days, absolute 30 days |
| Background jobs | Platform | PostgreSQL | 7 days after completion |
| Guest drafts | Browser | IndexedDB on the visitor's device | Until cleared by the visitor or the browser |
| Identity, passwords, email verification | Auth-Platform | Auth-Platform | Per Auth-Platform policy |

Guest data never reaches the server. A guest draft is uploaded only when the visitor explicitly saves it to an
account, and then the server recalculates every total before storing it.

---

## 7. Auth and workspace summary

Invoice stores no passwords. Users sign in through Auth-Platform's hosted login (platform SSO) or a standards
OIDC flow; the API redeems the handoff server-side and sets its own HttpOnly session cookie. Local development uses
`AUTH_MODE=stub`, which accepts any password for a typed email and never runs in staging or production.

A workspace is the tenant boundary. Every company, customer, catalog item, document, payment and audit event
belongs to exactly one workspace. Platform app access (`invoice.read`, `invoice.write`, `invoice.admin`) is checked
first; the local workspace role (`owner`, `admin`, `member`, `viewer`) decides what the person may do inside it.
Foreign ids answer `404`, never `403`, so ids cannot be probed.

Phase 1 ships single-member workspaces. The schema and role checks exist; invitations and member management are a
later enhancement. Full detail is in [`12-GUEST-MODE-AND-ACCOUNTS.md`](12-GUEST-MODE-AND-ACCOUNTS.md) and
[`0-SECURITY.md`](0-SECURITY.md) §5.

---

## 8. Canonical values (single source of truth)

| Value | Canonical form |
|---|---|
| Product name | Rumindium Invoice |
| API base path | `/api/v1` |
| Web routes | Public: `/`, `/{type}-generator`, `/guides/*`, `/templates`; app: `/app/*`; print: `/print/:token` |
| Currency | ISO 4217; default `IDR`; one currency per document |
| Locales | `id-ID` (default), `en-US` |
| Money columns | `NUMERIC(19,4)`; JSON and API serialise decimals as strings |
| Quantity columns | `NUMERIC(18,4)` |
| Dates | ISO 8601; dates `YYYY-MM-DD`, timestamps UTC with `Z` |
| Document ids | Prefixed ULIDs: `doc_`, `cus_`, `itm_`, `cmp_`, `wsp_`, `pay_`, `ast_`, `job_`, `ses_` |
| Document numbers | `QUO/{YYYY}/{SEQ:4}`, `SPH/{YYYY}/{SEQ:4}`, `SO/…`, `DO/…`, `INV/…`, `RCPT/…`, `CN/…`, `DN/…` |
| Default number reset | Yearly, 1 January in the company time zone |
| Error envelope | `{ "statusCode": 422, "code": "…", "message": "…", "details": […], "requestId": "…" }` |
| Session cookie | `rinv_session` on localhost; `__Host-rinv_session` in staging and production |
| CSRF cookie/header | `rinv_csrf` cookie; `X-CSRF-Token` header on mutations |
| Rate limits | Auth 10/min/IP; reads 600/min/user; writes 120/min/user; PDF 20/10 min/user |
| Dev ports | web `4210`, api `4310`, PostgreSQL `5432`, optional S3 `9010` |
| Health endpoints | `GET /api/v1/health/live`, `GET /api/v1/health/ready` |
| Paper | A4 default; Letter optional per template |
| PDF archive | `documents/{workspaceId}/{documentId}/r{revision}.pdf` |

---

## 9. Non-negotiable engineering rules

These are restated in every document and checked in review.

1. **The backend owns saved totals.** The browser may calculate a preview; the API recalculates every line and total
   before saving a draft or issuing a document, and rejects a mismatch with `422 TOTAL_MISMATCH`.
2. **Money is decimal.** `Decimal`/`NUMERIC` in the database, `Prisma.Decimal` or `decimal.js` in code. No JavaScript
   `number` is ever the authoritative value for money.
3. **Issued documents are immutable.** Issuer, customer, item descriptions, prices, tax inputs, totals, template and
   numbering are snapshotted at issue. Corrections use a revision, void, or adjustment document.
4. **Tenant scope on every read and write.** Queries include `workspaceId`; a foreign id is `404`.
5. **Numbering is transactional.** A row lock plus a unique constraint; no duplicate number under concurrency; no
   reused number after a void.
6. **Every status change writes an audit event** with actor, action, target and timestamp.
7. **No silent financial edits.** Voiding a receipt reverses its payment in the same transaction; payment history is
   never deleted.
8. **Guest data stays local.** No silent upload of seller, customer or price data; the visitor is told where it is
   stored and can clear it.
9. **One currency per document and per total.** Dashboard totals are grouped by currency; currencies are never added
   together.
10. **PDF output matches the preview and the stored snapshot.** One print route, one template, one set of values.
11. **No secrets in the browser.** Angular runtime config exposes only public origins, flags and a Sentry DSN.
12. **TypeScript strict.** No `any` in `packages/domain`, `packages/contracts` or API request handlers; no
    `@ts-ignore` without a linked issue.
13. **Feature docs are the spec.** A behaviour change updates its feature document in the same pull request.
14. **No placeholder buttons.** An action either works end to end or is absent from the UI.
15. **Measure before claiming performance.** Targets in this set are acceptance criteria, not estimates.

---

## 10. Performance targets

| Metric | Target | Measured by |
|---|---|---|
| Public page LCP, p75 mobile | ≤ 2.5 s | Lighthouse CI on a throttled profile |
| Public page CLS | ≤ 0.1 | Lighthouse CI |
| SSR TTFB, p95 | ≤ 400 ms | k6 against staging |
| REST read, p95 | ≤ 200 ms | k6 per release |
| Document list (50 rows), p95 | ≤ 300 ms | k6 with 10,000 documents |
| Draft save, p95 | ≤ 350 ms | API timing |
| Issue document, p95 | ≤ 500 ms | API timing, 50 concurrent |
| Client recalculation, 200 lines | ≤ 16 ms | Vitest benchmark |
| Server PDF, 5 pages | ≤ 5 s p95 | Worker metric `pdf_duration_seconds` |
| Server PDF, 50 pages | ≤ 20 s p95 | Worker metric |
| Public initial JS | ≤ 220 KB gzip | Build report |
| Editor route initial JS | ≤ 350 KB gzip | Build report |

---

## 11. Traceability — feature → doc

| Concern | Documents |
|---|---|
| What the user can create and edit | F01–F05, F14 |
| How a document becomes official | F06, F07, `0-DOCUMENT-MODEL` |
| How documents relate | F09, F13 |
| How money is calculated | F05, `0-DOCUMENT-MODEL` §6 |
| How data is stored and kept safe | `0-DATABASE`, `0-SECURITY` |
| How the API behaves | `0-API` |
| How to build, test and release | `0-FOLDER-STRUCTURE`, `0-TESTING`, `0-CICD`, `0-DEV-TO-PRODUCTION` |
| How the public pages rank and render | `0-WEB-AND-SEO`, F12 |
| How the product is operated | `0-OPERATIONS` |
