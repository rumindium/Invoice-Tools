# 0 — Architecture

> System architecture for Rumindium Invoice: topology, component responsibilities, document lifecycles, the PDF
> rendering path, failure domains, and the decisions behind them.
> Elaborates [`README.md`](README.md) §5–§6.
> Last updated: November 2026

---

## 1. Shape of the system

```text
ANGULAR SSR / PRERENDER  +  MODULAR NESTJS API  +  SINGLE POSTGRESQL  +  DISPOSABLE PDF WORKER
```

| Property | Consequence |
|---|---|
| The API is a modular monolith | One deployable, one database, one transaction boundary; modules can be extracted later if a measured bottleneck demands it |
| PostgreSQL is the only stateful dependency | Documents, sessions, jobs and audit share one transactional store; no Redis or message broker in phase 1 |
| The browser renders a preview | Fast feedback while editing; the server recalculates and is authoritative for saved and issued totals |
| Issued documents are snapshots | Later edits to master data cannot rewrite history |
| PDFs are rendered from the app's own print route | Preview and PDF use one template and one set of numbers, so they cannot drift |
| The worker is disposable | A crashed PDF job is retried; no worker holds the only copy of anything |
| Guest work is local | The server never receives guest seller, customer or price data |

### 1.1 Engineering rules the architecture enforces

1. One currency per document. No exchange-rate conversion in phase 1.
2. Money and quantities are decimal end to end; JSON carries them as strings.
3. Every saved document belongs to a workspace through its company; every query is scoped by that workspace.
4. Issuing a document is one transaction: number allocation, totals freeze, snapshots, revision row and audit event.
5. Receipts are documents, not a second parallel entity; a payment references the invoice and its receipt.
6. The API never trusts a client-submitted total for a saved draft or an issued document.
7. PDF rendering never runs in the request path. It is a job with a timeout, a retry limit and a bounded page count.
8. The print route is reachable only with a short-lived token minted by the API and scoped to one document revision.
9. No background worker reads a document that is still being edited; it reads the issued revision.
10. Every operational limit is configuration, never a literal buried in a handler.
11. Schema changes are forward-only migrations; the previous app version must run during a rollout.
12. No Kubernetes, Redis or microservice until a measured bottleneck requires it.

---

## 2. System context

```text
┌────────────────┐                          ┌──────────────────────────────┐
│ Anonymous      │  create, preview, print  │ Signed-in user               │
│ visitor        │ ────────────────────────▶│ Auth-Platform sign-in        │
└───────┬────────┘                          └──────────────┬───────────────┘
        │ browser (Angular)                                │
        ▼                                                  ▼
  ┌──────────────────────────────────────────────────────────────────┐
  │                       Rumindium Invoice                          │
  │  web (SSR/prerender)  →  api (NestJS)  →  worker (PDF, sweeps)   │
  │                              │                                   │
  │                              ▼                                   │
  │                         PostgreSQL                               │
  └──────┬──────────────────────────────────────────────┬────────────┘
         │ identity, sessions, app access                │ logos, PDFs
         ▼                                               ▼
  ┌──────────────────────┐                     ┌──────────────────────┐
  │ Auth-Platform         │                     │ S3-compatible bucket  │
  │ (sibling repository)  │                     │ or local disk (dev)   │
  └──────────────────────┘                     └──────────────────────┘
```

| Actor | Needs | Does not need |
|---|---|---|
| Guest | A generator page, a working editor, print or save-as-PDF, a clear explanation that data is local | An account, cloud storage, a reserved number |
| Freelancer / small business | Saved companies, customers, catalog, numbered documents, PDF archive, conversion, payment tracking | Accounting, inventory, bank feeds |
| Workspace administrator | Members, roles, companies, numbering, audit | Document content they are not a member of |
| Accountant / bookkeeper (future) | Read-only access to issued documents and receivables | Editing privileges |
| Auth-Platform | Identity, credentials, app access claims | Knowledge of invoice content |
| Operator | Queue depth, PDF failures, database health, error rate | Access to customer or document content |

**Trust boundaries** — each has its own validation:

```text
1. Browser → API          : session cookie, CSRF token, origin check, DTO validation, workspace scope
2. Browser → local draft  : untrusted input, but it never leaves the device until the user saves it
3. API → database         : bound parameters through Prisma; no string-built SQL
4. API → worker           : a job row, not a function call; the payload is an id and a revision, nothing else
5. Worker → print route   : a signed, short-lived token scoped to one document revision; Chromium reaches no other origin
6. Browser → uploaded logo: magic-byte check, size limit, re-encode; no SVG in phase 1
```

---

## 3. Topology

```text
            ┌────────────┐
 browser ──▶│  Ingress   │  TLS, HTTP/2, gzip/brotli, rate limit, security headers
            └─────┬──────┘
          ┌───────┴────────────────────────┐
          ▼                                ▼
   ┌─────────────┐                  ┌───────────────┐
   │ web  (×N)   │                  │ api  (×N)     │
   │ Angular SSR │                  │ NestJS REST   │
   └──────┬──────┘                  └───────┬───────┘
          │ print route                     │
          │                                 ├──────────────┐
          ▼                                 ▼              ▼
   ┌─────────────┐                  ┌────────────┐  ┌──────────────┐
   │ worker (×N) │                  │ PostgreSQL │  │ object store │
   │ Playwright  │◀────────────────▶│ documents, │  │ logos, PDFs  │
   │ PDF, sweeps │   job rows       │ jobs, audit│  └──────────────┘
   └─────────────┘                  └────────────┘
```

**Stage S1** — one host: `web`, `api`, `worker` and PostgreSQL in Docker Compose. Correct for development, CI and
the first production months.

**Stage S2** — the worker moves to its own container (already true in S1) and gets its own resource limits; the web
and API scale independently.

**Stage S3** — several API instances behind the ingress, managed PostgreSQL with point-in-time recovery, and an S3
bucket with lifecycle rules. No shared in-memory state exists, so horizontal scaling needs no sticky sessions.

Details of when each stage is introduced are in [`0-DEV-TO-PRODUCTION.md`](0-DEV-TO-PRODUCTION.md) §4.2.

---

## 4. Component responsibilities

| Component | Owns | Does not own |
|---|---|---|
| `apps/web` (Angular) | Public pages, generator editors, workspace UI, client-side preview calculation, local guest drafts, print layout | Saved totals, number allocation, authorization decisions |
| `apps/api` (NestJS) | REST routes, auth callback and sessions, workspace scope, validation, calculation verification, issuance, conversion, payments, PDF job creation | Rendering Chromium, long-running work |
| `apps/worker` (Node) | Claiming jobs, rendering PDFs through Chromium, marking overdue invoices, retention sweeps | HTTP request handling, business rules that need a user decision |
| `packages/domain` | Money, tax, discount allocation, totals, amount in words, numbering format, status transitions, conversion mapping | IO, Angular, NestJS, Prisma |
| `packages/contracts` | Zod schemas and inferred DTO types shared by web and API; route constants | Business logic, database access |
| `packages/templates` | Built-in layout definitions, print CSS tokens, page geometry | Data fetching, rendering runtime |
| `packages/config` | Typed environment parsing with Zod | Secret storage |
| `prisma/` | Schema, migrations, seed | Business logic |
| `tests/e2e` | Playwright journeys against a real stack | Unit-level detail |

The domain package is the only place where money arithmetic is defined. The browser imports it for instant
feedback; the API imports the same functions for the authoritative result. A discrepancy is a bug in one of the
two call sites, not a second implementation.

---

## 5. Request and document lifecycles

### 5.1 Saving a draft

```text
1. The editor validates locally and recalculates the preview (packages/domain, < 16 ms for 200 lines).
2. PATCH /api/v1/companies/{companyId}/documents/{id}  If-Match: "rev-7"
3. The API validates the DTO, loads the company scope, recalculates every line and total,
   compares the client's values, and rejects a mismatch with 422 TOTAL_MISMATCH.
4. In one transaction: update document, replace line items, increment version, write an audit event.
5. The response returns the stored document and the new version; the editor adopts the server values.
```

Autosave is debounced 1.5 s after the last edit and never runs while the document is being issued. A version
conflict (`409 DOCUMENT_VERSION_CONFLICT`) stops autosave and offers *Reload* or *Overwrite with my draft*.

### 5.2 Issuing an invoice

```text
1. POST /api/v1/companies/{companyId}/invoices/{id}/issue   Idempotency-Key: <uuid>
2. The API verifies: company and customer complete, at least one line, dates valid, totals valid,
   the document is DRAFT, and the caller may issue.
3. One transaction:
     a. SELECT ... FOR UPDATE on document_number_sequences (companyId, INVOICE)
     b. increment the sequence and format the number
     c. update the document: status ISSUED, number, issuedAt, frozen totals
     d. write issuer, customer, template and calculation snapshots
     e. insert a document_revisions row
     f. insert the audit event
     g. insert a pdf.generate background job
4. Commit. Return 200 with the issued document and the queued PDF job id.
5. The worker renders the PDF; GET .../pdf later redirects to the stored artefact.
```

If the PDF fails, the invoice remains issued. PDF failure never rolls back a valid financial document; the user
can retry the download and the job is retried with backoff.

### 5.3 Recording a payment

```text
1. POST /api/v1/companies/{companyId}/invoices/{id}/payments
   { paymentDate, amount, method, reference, notes }
2. The API locks the receipt sequence, then the invoice row, checks amount <= balanceDue, and calculates the
   new balance.
3. One transaction:
     a. insert payment (status RECORDED)
     b. allocate a receipt number from the locked sequence
     c. insert the receipt document (type RECEIPT, status ISSUED, totals = payment)
     d. link payment.receiptDocumentId
     e. update invoice amountPaid, balanceDue and status (PARTIALLY_PAID or PAID)
     f. audit events for payment and receipt
     g. enqueue the receipt PDF
4. Commit. Return the payment, receipt summary and invoice status.
```

### 5.4 Producing a PDF

```text
worker claims pdf.generate (FOR UPDATE SKIP LOCKED)
  → mint a print token (5 min, scoped to document id + revision)
  → open {WEB_ORIGIN}/print/{token} in Chromium
  → wait for document.documentElement.dataset.printReady === "true"
  → page.pdf({ printBackground: true, preferCSSPageSize: true })
  → validate page count and size
  → store documents/{workspaceId}/{documentId}/r{revision}.pdf
  → attach the asset to the document, mark the job succeeded
```

The print route is client-rendered: it fetches `/api/v1/print/{token}` for the frozen snapshot, renders the same
Angular template the user saw, and sets the ready flag. It carries `noindex`, `no-store` and a strict CSP.

### 5.5 Guest document

```text
visitor opens /invoice-generator
  → fills seller, customer and lines (no network)
  → preview recalculates in the browser
  → "Print / Save as PDF" opens the browser print dialog on the same preview
  → the draft is kept in IndexedDB and listed under "Your drafts on this device"
  → "Save to an account" signs in, uploads once, the server recalculates and stores a DRAFT
```

The guest document has a local reference such as `DRAFT-0003`, explicitly labelled *local reference, not a
reserved document number*. The official number is assigned when the document is issued in an account.

---

## 6. Rendering and PDF model

| Concern | Decision |
|---|---|
| Public pages | Prerendered at build time by Angular SSR; no user data, no server state |
| Workspace routes | Client-rendered (`RenderMode.Client`); the API is the only data source |
| Print route | Client-rendered, token-authenticated, no session cookie, no cache |
| Template source | One Angular component in `apps/web/src/app/print/`, driven by `packages/templates` |
| Page geometry | A4 default, Letter optional; margins, header and footer from the template snapshot |
| Fonts | Self-hosted Inter and Source Serif 4 (SIL OFL); no external font CDN |
| Page breaks | `thead` repeats, rows avoid breaking, totals block stays together, long descriptions wrap |
| Amount in words | Computed by `packages/domain`; the string is part of the frozen snapshot |
| PDF archive | One artefact per issued revision; regenerated only when a new revision is issued |
| Draft preview | Browser print dialog; no server artefact |
| Accessibility | Reading order matches the visual order; headings and table headers are real elements |

The print route is the **single renderer**. A server-side HTML template written separately would eventually drift
from the preview, so it is deliberately not used.

---

## 7. Failure domains and degradation

| Failure | Impact | Behaviour |
|---|---|---|
| PostgreSQL down | No reads or writes | API answers `503 DEPENDENCY_UNAVAILABLE` with `Retry-After`; no partial writes because every mutation is transactional |
| Web process down | Public pages and print route unavailable | Ingress serves a static maintenance page; API stays up, so no document is lost |
| Worker down | PDF jobs queue up | Issuing still works; jobs stay `QUEUED`; the queue-age alert fires after 10 minutes; a second worker drains it |
| Chromium crash | One PDF fails | Job retried up to 3 times with backoff; then `FAILED` with a user-visible reason; the document remains valid |
| Object storage down | Logos missing, PDFs cannot be written | Editing and issuing continue; logo upload disabled; PDF job retries |
| Auth-Platform down | New sign-ins fail | Existing sessions keep working until expiry; guests are unaffected |
| Print token leaked | One frozen snapshot readable | Token expires in 5 minutes and exposes only the document revision it was minted for |
| Duplicate issue request | Two numbers for one document | `Idempotency-Key` returns the first response; the document row lock and status check reject the second |
| Clock skew between API and database | Wrong due dates or sequence year | All timestamps come from the database (`now()`); the application never supplies `createdAt` |
| Disk full in a local-disk deployment | Uploads and PDFs fail | Readiness turns red for the storage dependency; the API keeps serving reads |

### 7.1 Backpressure

| Resource | Guard |
|---|---|
| PDF worker | Concurrency 2 per worker; job timeout 120 s; page limit 100 |
| API | 20 database connections per instance; request timeout 30 s at the ingress |
| Uploads | 2 MB logo limit; re-encode before storage |
| Document size | 200 lines; 5,000-character notes and terms |
| Lists | Cursor pagination, 100 rows maximum |
| Browser | Editor route lazy-loaded; preview recalculation debounced during typing |

---

## 8. Architecture decisions (ADR log)

| ADR | Decision | Why | Rejected |
|---|---|---|---|
| ADR-01 | **Angular SSR with prerendering for public pages, client rendering for the workspace** | Search engines get real HTML and fast LCP; private data never renders into a shared cache | Rendering the authenticated workspace on the server: leaks risk and adds no SEO value |
| ADR-02 | **Modular NestJS monolith** | One transaction boundary for issuance and payments; simple deployment; modules map to the domain | Microservices: distributed transactions for invoices and payments are a liability at this scale |
| ADR-03 | **PostgreSQL 16 + Prisma with `Decimal`** | Relational integrity, transactions, strong migrations, exact money | SQLite: single-writer limits and no managed PITR; floating point: unacceptable for money |
| ADR-04 | **PostgreSQL-backed job queue instead of Redis** | One datastore; `FOR UPDATE SKIP LOCKED` is reliable at this volume; fewer moving parts | Redis + BullMQ: a second stateful service for a queue that peaks at tens of jobs per minute |
| ADR-05 | **Auth-Platform for identity** | One identity system across the Rumindium suite; passwords, verification and SSO already exist there | A local password store: duplicate security surface and a second password reset flow |
| ADR-06 | **Receipts are documents of type `RECEIPT`** | One aggregate, one numbering path, one PDF path, one snapshot model | A separate `receipts` table: duplicates line items, totals and template logic |
| ADR-07 | **Server PDF by printing the app's print route with Chromium** | Preview and PDF cannot drift; one template; CSS page breaks are real browser layout | A separate server-side HTML template: guaranteed drift; a PDF drawing library: no HTML/CSS reuse |
| ADR-08 | **Guest-first local drafts** | Low-friction adoption and a clear privacy story; no server storage for anonymous data | Silent server drafts: privacy risk and orphan data |
| ADR-09 | **One calculation engine in `packages/domain`** | The browser and server produce identical numbers; tests cover one implementation | Two implementations (TypeScript and SQL): divergence is only found in production |
| ADR-10 | **Application-level tenant scoping, RLS later** | Prisma's connection pool makes per-session database variables error-prone; scoping is centralised in repository helpers and tested | PostgreSQL RLS in phase 1: strong, but easy to misconfigure with pooled connections |
| ADR-11 | **Node.js 22 + npm workspaces** | Angular SSR and NestJS are Node-first; one runtime for build, SSR, API and worker | Bun: faster installs, but adds a second runtime to debug for no product benefit here |
| ADR-12 | **Angular signals, no NgRx; CSS custom properties, no UI kit** | Small, typed state surfaces; the design language is bespoke and the bundle stays small | NgRx: ceremony without a shared-store need; a heavy UI kit: fights the document design |
| ADR-13 | **Local disk in development, S3 in staging and production** | Zero setup locally; durable, signed, lifecycle-managed storage in production | S3 locally: unnecessary MinIO dependency for one developer |
| ADR-14 | **One currency per document; no FX** | Tax and totals stay exact; the product is not an accounting system | Exchange-rate tables: out of scope and a source of silent financial error |

---

## 9. Environments

| Environment | Purpose | Topology | Data | Auth | Deploy |
|---|---|---|---|---|---|
| `local` | Developer machine | S1, Compose or rootless | Seeded fixtures | Stub identity | `npm run dev` |
| `ci` | Pull request checks | S1, service containers | Ephemeral | Stub identity | Per PR |
| `staging` | Release candidate, E2E, load tests | S2 | Anonymised copy, refreshed weekly | Auth-Platform staging | Merge to `main` |
| `production` | Real users | S2 → S3 | Real; PITR backups | Auth-Platform production | Tagged release |

Configuration differences are listed in [`0-CONFIG.md`](0-CONFIG.md) §7. Secrets live in the platform secret store
and are never shared between staging and production.

---

## 10. Non-goals (architectural)

- No event streaming, CQRS or read models. A relational query is fast enough for the dashboard at this scale.
- No Redis, RabbitMQ or Kafka in phase 1. Add one only when the job table or rate limiter is measured as a
  bottleneck.
- No server-side rendering of the authenticated workspace, and no shared cache for any private response.
- No FX conversion, multi-currency totals, or currency gain/loss.
- No general ledger, journal entries or trial balance.
- No inventory reservation or stock valuation; a delivery order records what was delivered, not stock levels.
- No plugin system or user-supplied HTML templates; both are code-execution surfaces.
- No Kubernetes until a single-host deployment is measured as insufficient.

---

## Related docs

- [`README.md`](README.md) — scope, feature matrix, canonical values
- [`0-DOCUMENT-MODEL.md`](0-DOCUMENT-MODEL.md) — what the aggregate contains and how it is frozen
- [`0-DATABASE.md`](0-DATABASE.md) — tables, indexes and transactions
- [`0-API.md`](0-API.md) — the REST contract
- [`0-SECURITY.md`](0-SECURITY.md) — threat model and controls
- [`0-OPERATIONS.md`](0-OPERATIONS.md) — monitoring, scaling, backup
