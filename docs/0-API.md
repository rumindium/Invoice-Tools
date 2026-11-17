# 0 — API

> The REST contract of the Rumindium Invoice API: routes, permissions, request and response shapes, errors,
> pagination, idempotency and rate limits. Everything the web app and worker call is specified here.
> Last updated: November 2026

---

## 1. Principles

| Rule | Detail |
|---|---|
| Base path | `/api/v1`. A breaking change creates `/api/v2`; additive changes do not |
| Format | JSON in and out (`application/json; charset=utf-8`), except uploads and file downloads |
| Validation | Zod schemas in `packages/contracts`; `nestjs-zod` validates **and** documents the route, so OpenAPI cannot drift |
| Types | The Angular client imports inferred types from `@rumindium/contracts`; it never hand-writes a request or response type |
| Ids | Prefixed ULIDs (`doc_…`, `cus_…`); a malformed id is `400`, a foreign id is `404` |
| Time | ISO 8601 UTC; business dates are `YYYY-MM-DD` |
| Decimals | Serialised as strings (`"1250000.0000"`), never JSON numbers |
| Auth | HttpOnly session cookie plus a double-submit CSRF token on every mutation |
| Scope | Every company-scoped route verifies that the company belongs to the session's workspace |
| Idempotency | Required on payments; accepted on issue, conversion and PDF creation; keys live 24 h |
| Caching | Private responses are `Cache-Control: private, no-store`; asset responses may be private-cached |
| Errors | One envelope, one code vocabulary (§4) |

---

## 2. Application composition

```ts
// apps/api/src/app.module.ts (shape, not the full file)
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: parseEnv }),
    LoggerModule.forRoot({ ...pinoConfig }),
    PrismaModule,
    AuthModule,
    UsersModule,
    WorkspacesModule,
    CompaniesModule,
    CustomersModule,
    CatalogModule,
    NumberingModule,
    TemplatesModule,
    DocumentsModule,
    ConversionModule,
    PaymentsModule,
    PdfModule,
    DashboardModule,
    AuditModule,
    JobsModule,
    HealthModule,
  ],
})
export class AppModule {}
```

`main.ts` sets the global prefix `api/v1`, enables the validation pipe with `whitelist` and
`forbidNonWhitelisted`, installs the request-id middleware, the exception filter and the cookie parser. Swagger is
mounted at `/api/docs` only when `API_DOCS_ENABLED=true` (development and staging).

---

## 3. Resources and routes

Permission values: `none` (public), `session` (any signed-in user), `read`, `write`, `admin` (workspace role plus
the matching Auth-Platform app permission), `token` (print token).

### 3.1 Health

| Method | Path | Permission | Purpose |
|---|---|---|---|
| `GET` | `/health/live` | none | Process is up; no dependency checks |
| `GET` | `/health/ready` | none | PostgreSQL reachable, migrations current, storage reachable; `503` names the failing dependency |

Readiness is used by the ingress and by the container health check. It never exposes versions of dependencies.

### 3.2 Authentication and session

| Method | Path | Permission | Purpose |
|---|---|---|---|
| `POST` | `/auth/login` | none | The app's own form: `{ email, password, returnTo? }`. The API verifies against Auth-Platform server-to-server, creates the session, sets the cookies and returns `{ user, workspace, expiresAt }` |
| `GET` | `/auth/login` | none | Browser fallback: `302` to the platform login page (`AUTH_FLOW=platform`) or an authorize URL with PKCE (`oidc`). Accepts `?returnTo=` |
| `GET` | `/auth/register` | none | `302` to Auth-Platform's registration page |
| `GET` | `/auth/callback` | none | Consumes state/nonce, exchanges the handoff, sets the session and redirects to a safe local path |
| `POST` | `/auth/logout` | session | Deletes the session row and clears the cookies; returns `{ ok, endSessionUrl? }` |
| `GET` | `/auth/me` | session | `{ user, workspace, role, permissions, expiresAt }` |
| `POST` | `/auth/refresh` | session | Rotates the CSRF secret and slides the session; returns the same shape as `/auth/me` |

There is **no refresh token**. The session is an opaque random value; its idle window slides on activity up to an
absolute 30-day expiry. Rotating the CSRF secret is the only "refresh" the browser needs.

`returnTo` is accepted only as a path on this origin. Anything else becomes `/dashboard`. A callback failure redirects
to `/login?error=<code>` rather than rendering JSON in the address bar.

Auth errors: `invalid_state`, `invalid_nonce`, `missing_code`, `invalid_credentials`, `account_inactive`,
`provider_unreachable`, `auth_unavailable`.

### 3.3 Workspace

| Method | Path | Permission | Purpose |
|---|---|---|---|
| `GET` | `/workspaces/current` | session | `{ id, name, role, authTenantId, defaults: { companyId? }, usage: { companies, documents } }` |
| `PATCH` | `/workspaces/current` | admin | Rename the workspace (1–80 characters) |
| `GET` | `/workspaces/current/members` | admin | Phase 1 returns the single owner; the route exists so member management is additive |

The workspace is derived from the session, never from a query parameter or body.

### 3.4 Companies

| Method | Path | Permission | Purpose |
|---|---|---|---|
| `GET` | `/companies` | read | All companies in the workspace, archived excluded by default (`?includeArchived=true`) |
| `POST` | `/companies` | write | Create a company profile; the first one becomes the default |
| `GET` | `/companies/:companyId` | read | Full profile |
| `PATCH` | `/companies/:companyId` | write | Update profile fields; changes never touch issued documents |
| `DELETE` | `/companies/:companyId` | admin | Archive; `409 COMPANY_IN_USE` when it is the only company with documents |
| `POST` | `/companies/:companyId/logo` | write | Multipart logo upload (PNG, JPEG, WebP; ≤ 2 MB); returns the asset reference |
| `DELETE` | `/companies/:companyId/logo` | write | Remove the logo reference; the asset is collected later |

`DELETE` never removes a company row that documents reference. Archiving hides it from pickers and keeps every
issued snapshot readable.

### 3.5 Customers

| Method | Path | Permission | Purpose |
|---|---|---|---|
| `GET` | `/companies/:companyId/customers` | read | Cursor list; `?q=`, `?includeArchived=`, `?limit=`, `?cursor=` |
| `POST` | `/companies/:companyId/customers` | write | Create; `duplicateHints` returned, save is not blocked |
| `GET` | `/companies/:companyId/customers/:customerId` | read | Full customer with recent documents |
| `PATCH` | `/companies/:companyId/customers/:customerId` | write | Update; never rewrites a document snapshot |
| `DELETE` | `/companies/:companyId/customers/:customerId` | write | Archive |
| `GET` | `/companies/:companyId/customers/:customerId/statement` | read | Phase 5 statement preview; `404` until F13 ships |

### 3.6 Catalog

| Method | Path | Permission | Purpose |
|---|---|---|---|
| `GET` | `/companies/:companyId/items` | read | Cursor list; `?q=`, `?kind=PRODUCT\|SERVICE`, `?includeArchived=` |
| `POST` | `/companies/:companyId/items` | write | Create item |
| `GET` | `/companies/:companyId/items/:itemId` | read | Item detail |
| `PATCH` | `/companies/:companyId/items/:itemId` | write | Update; price changes apply only to future lines |
| `DELETE` | `/companies/:companyId/items/:itemId` | write | Archive |

### 3.7 Numbering

| Method | Path | Permission | Purpose |
|---|---|---|---|
| `GET` | `/companies/:companyId/numbering` | read | One entry per document type: pattern, reset policy, padding, next number |
| `PUT` | `/companies/:companyId/numbering/:documentType` | admin | `{ pattern, resetPolicy, padding }`; rejected when the pattern would duplicate the current period's format |
| `GET` | `/companies/:companyId/numbering/:documentType/preview` | read | The next formatted number **without consuming it** |

Pattern tokens and validation are in [`06-DOCUMENT-NUMBERING.md`](06-DOCUMENT-NUMBERING.md) §3.

### 3.8 Templates

| Method | Path | Permission | Purpose |
|---|---|---|---|
| `GET` | `/companies/:companyId/templates` | read | Built-in and company templates |
| `POST` | `/companies/:companyId/templates` | admin | Clone a built-in template into a company template (P5) |
| `PATCH` | `/templates/:templateId` | admin | Accent, paper size, logo position, footer, bank/signature toggles |
| `DELETE` | `/templates/:templateId` | admin | Archive a company template; the default cannot be archived |

A template referenced by an issued document can be archived; the snapshot keeps it renderable.

### 3.9 Documents

| Method | Path | Permission | Purpose |
|---|---|---|---|
| `GET` | `/companies/:companyId/documents` | read | Cursor list with filters and a closed sort enum (§5) |
| `GET` | `/companies/:companyId/documents/:documentId` | read | Full document, items and relations |
| `PATCH` | `/companies/:companyId/documents/:documentId` | write | Save a **draft**; requires `If-Match`; recalculates server-side |
| `DELETE` | `/companies/:companyId/documents/:documentId` | write | Soft-delete a draft; `409 DOCUMENT_STATE_INVALID` once issued |
| `GET` | `/companies/:companyId/documents/:documentId/revisions` | read | Issued revisions, newest first |
| `POST` | `/companies/:companyId/documents/:documentId/revisions` | write | Create a new draft revision of an issued quotation/order (P3) |
| `GET` | `/companies/:companyId/documents/:documentId/conversion-options` | read | Which targets this document can become, and why not |

**List response**

```json
{
  "documents": [
    {
      "id": "doc_01J9Z6…",
      "type": "INVOICE",
      "number": "INV/2026/0007",
      "status": "PARTIALLY_PAID",
      "issueDate": "2026-11-01",
      "dueDate": "2026-11-15",
      "customer": { "id": "cus_01J9…", "name": "PT Pelanggan" },
      "currency": "IDR",
      "grandTotal": "1250000.0000",
      "balanceDue": "450000.0000",
      "version": 4
    }
  ],
  "total": 128,
  "nextCursor": "eyJ2IjoxLCJrIjpbIjIwMjYtMTEtMDEiLCJkb2NfMDFKOVo2Il19"
}
```

**Create** (`POST /companies/:companyId/quotations`, `/sales-orders`, `/delivery-orders`, `/invoices`)

```json
{
  "customerId": "cus_01J9…",
  "customer": null,
  "templateId": "tpl_01J9…",
  "issueDate": "2026-11-17",
  "dueDate": "2026-12-01",
  "validUntil": null,
  "referenceNumber": "PO-2026-0042",
  "currencyCode": "IDR",
  "taxMode": "EXCLUSIVE",
  "discountType": "PERCENT",
  "discountRate": "5.0000",
  "discountAmount": null,
  "items": [
    {
      "itemName": "Design retainer",
      "description": "November 2026",
      "quantity": "2.0000",
      "unit": "month",
      "unitPrice": "500000.0000",
      "discountType": "PERCENT",
      "discountRate": "10.0000",
      "taxRate": "11.0000"
    }
  ],
  "shippingAmount": "25000.0000",
  "additionalCharges": "0.0000",
  "chargesTaxRate": null,
  "notes": "",
  "terms": "Payment within 14 days."
}
```

Returns `201` with the draft and its server-calculated totals. A one-time customer is sent in `customer`
instead of `customerId` under guest import and account creation paths; the API writes a snapshot but no customer
row.

**Save draft** requires `If-Match: "rev-3"`. The body is the same shape as create; absent optional fields keep
their stored value, while `items` replaces the whole list. A stale version answers `409 DOCUMENT_VERSION_CONFLICT`
with the current document in `details.current`.

### 3.10 Type-specific actions

| Type | Create | Actions |
|---|---|---|
| Quotation | `POST /companies/:companyId/quotations` | `POST …/quotations/:id/issue`, `/accept`, `/reject`, `/expire`, `/revise` |
| Sales order | `POST /companies/:companyId/sales-orders` | `POST …/sales-orders/:id/confirm`, `/process`, `/complete`, `/cancel` |
| Delivery order | `POST /companies/:companyId/delivery-orders` | `POST …/delivery-orders/:id/issue`, `/deliver`, `/cancel` |
| Invoice | `POST /companies/:companyId/invoices` | `POST …/invoices/:id/issue`, `/void` |
| Receipt | Created only by recording a payment | `POST …/receipts/:id/void` |
| Credit note (P5) | `POST …/invoices/:id/credit-notes` | `POST …/credit-notes/:id/issue`, `/void` |
| Debit note (P5) | `POST …/invoices/:id/debit-notes` | `POST …/debit-notes/:id/issue`, `/void` |

Action bodies:

| Action | Body | Result |
|---|---|---|
| `issue` | none | Number allocated, snapshots written, PDF queued; `200` with the document |
| `accept` / `reject` | `{ note? }` | Status change and audit; `200` |
| `expire` | none | Only when `validUntil` is past; `200` |
| `revise` | `{ reason? }` | New draft linked by `REVISED_FROM`; `201` with the new draft |
| `confirm` / `process` / `complete` | none | Status change; `200` |
| `cancel` | `{ reason }` | Status change; `409` when delivery or payment history blocks it |
| `deliver` | `{ deliveredAt?, note? }` | `DELIVERED` or `PARTIALLY_DELIVERED`; `200` |
| `void` | `{ reason }` | Controlled void; invoice requires `amountPaid = 0`; `200` |

Every action is idempotent at the state level: repeating the same transition answers `409 DOCUMENT_STATE_INVALID`
with the current status, not a duplicate side effect. With an `Idempotency-Key`, the original response is
replayed instead.

### 3.11 Conversion

| Method | Path | Permission | Purpose |
|---|---|---|---|
| `POST` | `/companies/:companyId/quotations/:id/convert-to-sales-order` | write | Create a sales-order draft |
| `POST` | `/companies/:companyId/sales-orders/:id/convert-to-delivery-order` | write | Create a delivery-order draft |
| `POST` | `/companies/:companyId/sales-orders/:id/convert-to-invoice` | write | Create an invoice draft |
| `POST` | `/companies/:companyId/delivery-orders/:id/convert-to-invoice` | write | Create an invoice draft |

Body: `{ "allowDuplicate": false, "reason?": "…" }`. Success is `201` with
`{ document, relation: { id, type: "CONVERTED_TO", sourceDocumentId } }`. A second active target answers
`409 DUPLICATE_CONVERSION` unless `allowDuplicate` is true; the override is audited. Mapping rules are in
[`09-DOCUMENT-CONVERSION.md`](09-DOCUMENT-CONVERSION.md).

### 3.12 Payments and receipts

| Method | Path | Permission | Purpose |
|---|---|---|---|
| `GET` | `/companies/:companyId/invoices/:id/payments` | read | Payments and their receipts, newest first |
| `POST` | `/companies/:companyId/invoices/:id/payments` | write | Record a manual payment; **requires `Idempotency-Key`** |
| `GET` | `/companies/:companyId/payments/:paymentId` | read | Payment detail and receipt link |
| `POST` | `/companies/:companyId/receipts/:id/void` | write | Void a receipt and reverse its payment |

```json
{
  "paymentDate": "2026-11-17",
  "amount": "800000.0000",
  "method": "BANK_TRANSFER",
  "reference": "TRX-998812",
  "notes": "First instalment"
}
```

`201` returns:

```json
{
  "payment": { "id": "pay_01J…", "amount": "800000.0000", "status": "RECORDED" },
  "receipt": { "id": "doc_01J…", "number": "RCPT/2026/0003", "status": "ISSUED" },
  "invoice": { "id": "doc_01J…", "status": "PARTIALLY_PAID", "amountPaid": "800000.0000", "balanceDue": "450000.0000" }
}
```

Rejections: `422 PAYMENT_EXCEEDS_BALANCE`, `422 CURRENCY_MISMATCH`, `422 PAYMENT_DATE_INVALID`,
`409 DOCUMENT_STATE_INVALID` for a void or paid invoice.

### 3.13 PDF and print

| Method | Path | Permission | Purpose |
|---|---|---|---|
| `POST` | `/companies/:companyId/documents/:id/pdf` | write | Queue a PDF for the current draft or issued revision; `202 { jobId, statusUrl }` |
| `GET` | `/companies/:companyId/documents/:id/pdf` | read | `302` to a signed download when ready; `202` with the running job; `404` when none exists |
| `GET` | `/jobs/:jobId` | creator | Job status, attempts, error code, PDF readiness |
| `GET` | `/print/:token` | token | The frozen print payload; no session cookie; `no-store` |
| `GET` | `/print/:token/logo` | token | The issuer logo for that print token |

Print token rules:

- 32 random bytes, base64url, stored as SHA-256; expires in 5 minutes.
- Bound to one document and revision; a draft preview uses revision `0`.
- Revoked when the job finishes or fails.
- The route returns only presentation data: issuer, customer, template, lines, totals and amount in words. No
  cost, no internal notes, no other document ids.
- `Cache-Control: no-store`, `X-Robots-Tag: noindex`, CSP `default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'`.

Downloads are signed object-storage URLs valid for 5 minutes. When the storage driver is `local`, the API streams
the file instead.

### 3.14 Dashboard, audit, jobs and assets

| Method | Path | Permission | Purpose |
|---|---|---|---|
| `GET` | `/companies/:companyId/dashboard` | read | Summary for a date range, grouped by currency |
| `GET` | `/companies/:companyId/audit-logs` | admin | Append-only audit, newest first; `?action=`, `?targetType=`, `?limit=`, `?cursor=` |
| `GET` | `/assets/:assetId` | read | Stream or redirect a workspace asset (logo) |

Dashboard response:

```json
{
  "range": { "from": "2026-11-01", "to": "2026-11-30", "asOf": "2026-11-17T10:00:00Z" },
  "currencies": [
    {
      "currency": "IDR",
      "outstanding": "12500000.0000",
      "overdue": "2500000.0000",
      "issuedInvoices": 12,
      "overdueInvoices": 3,
      "acceptedQuotations": 7,
      "totalQuotations": 20
    }
  ],
  "recent": [ { "id": "doc_01J…", "type": "INVOICE", "number": "INV/2026/0007", "status": "ISSUED", "grandTotal": "1250000.0000", "updatedAt": "2026-11-17T09:58:00Z" } ]
}
```

Definitions of outstanding, overdue and accepted are in [`11-DASHBOARD-AND-SEARCH.md`](11-DASHBOARD-AND-SEARCH.md) §3.

---

## 4. Error model

Every error uses the specification's envelope:

```json
{
  "statusCode": 422,
  "code": "DOCUMENT_VALIDATION_FAILED",
  "message": "The document contains invalid values.",
  "details": [
    { "field": "items.0.quantity", "message": "Quantity must be greater than zero." }
  ],
  "requestId": "req_01J9Z6…"
}
```

| HTTP | Codes | When |
|---|---|---|
| 400 | `VALIDATION_FAILED`, `INVALID_ID`, `INVALID_CURSOR`, `IDEMPOTENCY_KEY_REQUIRED` | Malformed request or parameter |
| 401 | `UNAUTHENTICATED`, `SESSION_EXPIRED` | No valid session |
| 403 | `FORBIDDEN`, `CSRF_REJECTED`, `ROLE_INSUFFICIENT` | Authenticated but not allowed |
| 404 | `NOT_FOUND` | Also used for a foreign id, so existence cannot be probed |
| 409 | `DOCUMENT_VERSION_CONFLICT`, `DOCUMENT_STATE_INVALID`, `DUPLICATE_DOCUMENT_NUMBER`, `DUPLICATE_CONVERSION`, `DUPLICATE_SKU`, `COMPANY_IN_USE`, `IDEMPOTENCY_CONFLICT` | State, version or uniqueness conflict |
| 413 | `PAYLOAD_TOO_LARGE` | Logo or body over the limit |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Upload type rejected |
| 422 | `DOCUMENT_VALIDATION_FAILED`, `TOTAL_MISMATCH`, `PAYMENT_EXCEEDS_BALANCE`, `CREDIT_EXCEEDS_BALANCE`, `PAYMENT_DATE_INVALID`, `CURRENCY_MISMATCH`, `DOCUMENT_LIMIT_EXCEEDED`, `PDF_TOO_LARGE` | Semantically invalid but well-formed |
| 429 | `RATE_LIMITED` | Includes `Retry-After` |
| 500 | `INTERNAL` | Logged with `requestId`; the message is generic |
| 503 | `DEPENDENCY_UNAVAILABLE`, `AUTH_UNAVAILABLE` | Database, storage or identity unavailable; `Retry-After` set |

Stack traces, SQL and provider responses never leave the process. `details` contains field paths and safe values
only; it never echoes a session token, a signed URL or a customer's full record.

---

## 5. Pagination, filtering and sorting

- Cursor pagination only: `?limit=` (default 25, max 100) and `?cursor=`. A page returns `nextCursor` (`null` at
  the end) and `total` for the filtered set.
- The cursor is opaque base64url JSON `{ v: 1, k: [...] }`, bound to the sort that produced it. Reusing it with a
  different sort answers `400 INVALID_CURSOR`.
- Sorts are closed enums, never a column and direction from the client:

| Resource | Sorts |
|---|---|
| Documents | `newest` (default), `oldest`, `issue-desc`, `issue-asc`, `number-asc`, `number-desc`, `due-asc` |
| Customers | `name-asc` (default), `newest` |
| Catalog | `name-asc` (default), `newest`, `price-asc`, `price-desc` |
| Audit | `newest` only |

- Document filters: `type`, `status`, `customerId`, `q` (number, reference or customer name), `issueFrom`,
  `issueTo`, `dueFrom`, `dueTo`, `currency`, `includeDrafts` (default true for the owner).
- Search is a case-insensitive substring with `%` and `_` escaped, sent as one bound parameter. Trigram indexes
  keep it fast at 10,000 documents.
- Unknown query parameters answer `400 VALIDATION_FAILED`; they are never silently ignored.

---

## 6. Idempotency

| Rule | Detail |
|---|---|
| Header | `Idempotency-Key`, 8–128 URL-safe characters |
| Required | `POST …/invoices/:id/payments` |
| Accepted | issue, conversion, PDF creation, receipt void |
| Storage | `idempotency_keys`, unique `(user_id, route, key)`, 24 hours |
| Replay | Same key and same request hash returns the stored status and body with `Idempotent-Replayed: true` |
| Conflict | Same key, different body → `409 IDEMPOTENCY_CONFLICT` |
| Failure | A failed request is not stored; the client may retry with the same key |

The payment path also relies on the invoice row lock and balance check, so a lost response cannot charge twice
even if the key is reused incorrectly by another client.

---

## 7. Rate limits

Sliding-window counters in PostgreSQL, keyed by user id or IP; values come from configuration.

| Scope | Limit | Key |
|---|---|---|
| Auth endpoints | 10 per minute | IP + email hash |
| Public pages and print payload | 120 per minute | IP |
| Authenticated reads | 600 per minute | user id |
| Authenticated writes | 120 per minute | user id |
| Payment recording | 30 per 10 minutes | user id |
| PDF creation | 20 per 10 minutes, 5 concurrent | user id |
| Logo upload | 20 per 10 minutes | user id |

`429` includes `Retry-After`. A limit is never enforced only in the Angular client.

---

## 8. OpenAPI and typed client

- `nestjs-zod` derives the OpenAPI schema from the same Zod contracts used for validation.
- `GET /api/openapi.json` is generated at boot; `docs/openapi.json` is committed and compared in CI
  (`npm run contracts:check`). A route change without a regenerated document fails the build.
- Swagger UI is available at `/api/docs` in development and staging; production serves it only when
  `API_DOCS_ENABLED=true`.
- The Angular client uses `openapi-typescript` output plus thin resource services
  (`apps/web/src/app/core/api/`). Query state is held in Angular signals; there is no second API type layer.
- Every route has a contract test asserting: unauthenticated `401`, insufficient role `403`, foreign id `404`,
  invalid body `400`/`422`, and the success shape.

---

## 9. Versioning and deprecation

- Additive fields are non-breaking; clients ignore unknown enum values and fields.
- A deprecated field stays for two minor releases, returns `Deprecation: true` and a `Sunset` date, and is listed
  here with its removal version.
- Removing or renaming a route requires `/api/v2` and a release note. No route is removed in a patch release.
- Error codes are part of the contract; a rename is a breaking change.

---

## 10. Contract tests

- `apps/api/test/contract/` covers every route with a seeded workspace and a second workspace for isolation.
- The financial contract has explicit cases: totals mismatch, currency mismatch, overpayment, stale version,
  duplicate number under 50 parallel issues, and a voided receipt.
- The print contract asserts that the payload contains no internal notes, no cost fields and no other document
  ids.
- `npm run contracts:check` must be clean before a release.

---

## Related docs

- [`0-DOCUMENT-MODEL.md`](0-DOCUMENT-MODEL.md) — the data behind every response
- [`0-SECURITY.md`](0-SECURITY.md) — auth, CSRF, authorization and upload rules
- [`0-CONFIG.md`](0-CONFIG.md) — rate-limit and size settings
- [`0-DATABASE.md`](0-DATABASE.md) — tables and transactions
- [`08-PDF-AND-PRINT.md`](08-PDF-AND-PRINT.md) — what the PDF routes produce
