# 0 — Testing

> Test levels, financial vectors, concurrency and isolation tests, PDF verification, performance budgets, and the
> definition of done for a feature.
> Last updated: November 2026

---

## 1. Test pyramid

```text
              Playwright E2E (critical journeys, nightly + smoke on PR)
            ────────────────────────────────────────────────────────────
             Integration (NestJS + PostgreSQL + Supertest) and contract tests
           ──────────────────────────────────────────────────────────────
            Unit (domain money/tax/lifecycle, Angular components, pipes)
```

| Level | Runner | Where | Gate |
|---|---|---|---|
| Domain unit | Vitest | `packages/domain/src/**/*.test.ts` | Every PR |
| API unit | Vitest | `apps/api/src/**/*.test.ts` | Every PR |
| Angular unit | Angular CLI + Vitest | `apps/web/src/**/*.spec.ts` | Every PR |
| Integration | Vitest + Supertest + PostgreSQL | `apps/api/test/integration/` | Every PR |
| Contract | Vitest + OpenAPI snapshot | `apps/api/test/contract/` | Every PR |
| E2E smoke | Playwright | `tests/e2e/smoke.spec.ts` | Every PR |
| E2E full | Playwright | `tests/e2e/**` | Nightly and release |
| Load | k6 | `tests/load/` | Nightly and release |
| Security | Vitest + ZAP baseline | `apps/api/test/security/` | Nightly |

A test that needs a browser is not used to prove arithmetic. A test that needs the network is not used to prove a
component's behaviour.

---

## 2. Unit tests

### 2.1 Domain (mandatory, high coverage)

| Area | Cases |
|---|---|
| Line gross | quantity × price; 4 decimal places; maximum values |
| Line discount | none, percent, fixed amount, amount equal to gross, amount above gross rejected |
| Document discount | percent and fixed, allocated proportionally, largest-remainder sums exactly |
| Tax exclusive | one rate, mixed rates, zero rate, 100% rate |
| Tax inclusive | extraction formula, mixed rates, zero rate |
| Charges | untaxed, taxed, tax-inclusive mode |
| Rounding | HALF_UP at minor units; IDR 0 decimals, USD 2, JPY 0 |
| Amount in words | 0, 1, 11, 111, 1,000, 1,000,001, 999,999,999, IDR and USD, negative for credit notes |
| Numbering format | tokens, padding, yearly/monthly reset, year rollover |
| Status machine | every allowed and forbidden transition per type, with context |
| Conversion map | field-by-field mapping for every path |
| Dates | due date, valid until, overdue boundary at company midnight |
| Permissions | role/permission matrix table-driven |

### 2.2 API unit

- DTO mapping, error-code selection, pagination cursor encode/decode, scope helper, print-token hashing,
  amount serialisation as strings.

### 2.3 Angular unit

- Editor form validation, line add/edit/delete/reorder, totals display, currency formatting, guest storage
  service (with a fake IndexedDB), route guards, SEO metadata service (pure functions).

---

## 3. Integration tests

Each suite runs against a real PostgreSQL database created per worker, migrated with `prisma migrate deploy`,
seeded with two workspaces.

| Suite | Asserts |
|---|---|
| Issuance | Draft → issued: number, status, snapshots, revision, audit, PDF job, immutability |
| Numbering | 50 parallel issues produce 50 unique sequential numbers; a void does not reuse one; yearly reset |
| Snapshot immutability | Update company logo/address, customer name and catalog price after issue; reload document and PDF payload; values unchanged |
| Payments | Partial then full payment, status transitions, receipt per payment, balance exact; overpayment rejected; currency mismatch rejected; future date rejected |
| Void | Receipt void reverses amount and status; double void rejected; invoice void blocked when paid |
| Conversion | Every path maps lines, discounts, tax and references; source unchanged; duplicate blocked |
| Tenant isolation | Every route with a foreign id answers `404`; list counts exclude the other workspace |
| Draft concurrency | Two saves with the same `If-Match`: one succeeds, one `409`; no lost update |
| PDF jobs | Issue enqueues one job; retry does not duplicate; failed job leaves the document issued |
| Print token | Valid token returns one revision; expired/revoked/foreign token `404`; payload has no internal fields |
| Retention | Soft-deleted draft removed after 30 days; audit older than 12 months removed; assets collected |
| Audit | Every transition writes exactly one event with actor and statuses |

Integration tests use the real Prisma client and real SQL. Mocking the database is forbidden for these paths.

---

## 4. Contract tests

- Every route: unauthenticated `401`, insufficient role `403`, foreign id `404`, invalid body `400`/`422`, success
  shape.
- `docs/openapi.json` is regenerated and compared; a drift fails `npm run contracts:check`.
- The print payload contract asserts the exact allowed keys and rejects any additional field.
- Error codes are asserted literally, not by status alone.

---

## 5. Frontend tests

| Area | Cases |
|---|---|
| Editor | Required fields, quantity/price bounds, discount bounds, date order, field-level messages |
| Lines | Add, edit, delete, reorder; positions stay contiguous; totals update |
| Preview | Renders the same totals as the form; changing currency reformats, never recalculates across currencies |
| Guest mode | Draft persists across reload; clear removes it; no network request while typing (asserted) |
| Save/issue | Buttons disabled while saving; conflict dialog on `409`; success updates the status |
| Print | Print route renders with `data-print-ready`; long descriptions and 200 lines paginate |
| SSR | Prerendered public HTML contains the title, description, canonical and JSON-LD; hydration produces no console error |
| Accessibility | axe-core on home, generator, editor and dashboard; keyboard traversal of the editor |

Angular tests use `provideHttpClientTesting` and never call the real API.

---

## 6. End-to-end tests

### 6.1 Critical journey (must pass before a release)

```text
1.  Sign in.
2.  Create a company profile with a logo.
3.  Create a customer.
4.  Create two catalog items.
5.  Create a quotation with three lines, a discount and tax.
6.  Issue the quotation; verify the number and PDF download.
7.  Accept the quotation.
8.  Convert it to a sales order; verify copied lines and the source link.
9.  Confirm and process the order.
10. Convert the order to a delivery order; issue and mark delivered.
11. Convert the order to an invoice; issue it.
12. Record a partial payment; download the receipt.
13. Record the remaining payment; invoice becomes PAID.
14. Void the second receipt; invoice returns to PARTIALLY_PAID.
15. Sign out; verify the workspace is unreachable.
```

A second journey covers guest mode: create an invoice, print preview, reload and find the local draft, clear it,
and confirm it is gone.

A third covers isolation: two accounts, two workspaces, one tries every document route with the other's id.

### 6.2 Smoke set (every PR)

Sign in, create an invoice with one line, issue it, open the print route, record a payment, sign out. Under three
minutes on CI.

### 6.3 Test data

Fixtures live in `tests/fixtures/` and use `example.test` addresses. No production data is copied to staging
without anonymisation. Money fixtures are JSON with string decimals so they can be asserted exactly.

---

## 7. Financial vectors

These exact cases are asserted in domain unit tests and again through the API.

| # | Case | Expected |
|---|---|---|
| 1 | 2 × 500,000; 10% line discount; 11% tax exclusive; 5% document discount; 25,000 shipping | subtotal 855,000; tax 94,050; grand 974,050 |
| 2 | 1,110,000 tax-inclusive at 11% | net 1,000,000; tax 110,000; grand 1,110,000 |
| 3 | 3 lines, 0% tax, fixed 50,000 discount | discount allocated exactly; grand = subtotal − 50,000 |
| 4 | 1 IDR line at 333.3333 × 3, 11% tax | tax rounded to whole rupiah; stored values sum exactly |
| 5 | 1 USD line at 19.99 × 3, 8.875% tax | tax rounded to cents; grand has 2 decimals of precision |
| 6 | 200 lines of 1 × 1,000 | subtotal 200,000; recalculation under 16 ms |
| 7 | Quantity 0 | `DOCUMENT_VALIDATION_FAILED` |
| 8 | Fixed discount > line gross | `DOCUMENT_VALIDATION_FAILED` |
| 9 | Payment 1,000,001 on a 1,000,000 invoice | `PAYMENT_EXCEEDS_BALANCE` |
| 10 | Two payments of 500,000 | first PARTIALLY_PAID, second PAID, balance 0 |
| 11 | Void the second payment | back to PARTIALLY_PAID, balance 500,000 |
| 12 | Client sends a grand total 1 rupiah lower | `TOTAL_MISMATCH` |

---

## 8. Concurrency and race tests

| Test | Method |
|---|---|
| 50 issues of 50 documents, same company/type | `Promise.all`; assert 50 unique consecutive numbers |
| 20 payments against one invoice | Exactly the affordable number succeed; balance never negative |
| Two draft saves at the same version | One `200`, one `409`, stored data matches the winner |
| Two conversions of one quotation | One `201`, one `409 DUPLICATE_CONVERSION` |
| Job claim by two workers | Each job runs once; `SKIP LOCKED` verified |
| Overdue sweep while a payment commits | Status settles correctly; no lost payment |

---

## 9. PDF and visual tests

- **Parity:** the print route is screenshotted at A4 in Chromium and compared with a stored baseline; threshold
  0.1% of pixels. Fonts are bundled, so rendering is deterministic across CI runs.
- **Content:** page count, extracted text (number, customer, totals, amount in words), and absence of internal
  notes are asserted.
- **Pagination:** 1 line, 40 lines, 200 lines, a 2,000-character description and a long footer; headers repeat and
  totals stay together.
- **Locales:** `id-ID` and `en-US` render the correct labels and number formats.
- **Failure:** a 101-page document is rejected with `PDF_TOO_LARGE`; a worker timeout marks the job failed and the
  document remains issued.

Baselines are stored in `tests/e2e/__screenshots__/` and updated only with a reviewed diff.

---

## 10. Accessibility tests

- axe-core with no serious or critical violations on the home page, generator, editor, document detail and
  dashboard.
- Keyboard-only run of the critical journey for the editor: create lines, move a line, save, issue.
- Focus visible, dialog focus trap, error summary linking to fields.
- Status is never conveyed by colour alone; each badge has text.
- The PDF is checked for reading order and real table headers, not tagged-PDF compliance claims.

---

## 11. Performance and load

| Test | Target |
|---|---|
| Lighthouse CI, public page, mobile throttling | LCP ≤ 2.5 s, CLS ≤ 0.1, TBT ≤ 200 ms |
| k6, document list, 10,000 documents | p95 ≤ 300 ms |
| k6, draft save | p95 ≤ 350 ms |
| k6, 50 concurrent issues | p95 ≤ 500 ms, no duplicates |
| k6, dashboard | p95 ≤ 400 ms |
| Domain benchmark, 200 lines | ≤ 16 ms |
| PDF, 5 pages | ≤ 5 s p95 |
| PDF, 50 pages | ≤ 20 s p95 |

A performance claim in a pull request links to the run. Targets are acceptance criteria, not aspirations.

---

## 12. Security tests

- IDOR matrix: for every route with an id, a second workspace's id returns `404`.
- CSRF: mutation without `X-CSRF-Token` → `403`; wrong origin → `403`.
- XSS payloads in customer name, item description, notes, terms and footer → rendered as text in HTML and PDF.
- Upload: a renamed `.exe`, an SVG with script, a 3 MB PNG and a decompression bomb → rejected; a valid PNG is
  re-encoded.
- Print: expired, revoked, foreign and malformed tokens → `404`; the payload contains no internal fields.
- Rate limits: the configured limit returns `429` with `Retry-After`.
- Headers: CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy` and `frame-ancestors` asserted on every HTML
  response.
- ZAP baseline against staging, no high-risk findings.

---

## 13. Coverage and quality gates

| Scope | Lines | Branches |
|---|---|---|
| `packages/domain` | ≥ 95% | ≥ 90% |
| `apps/api` | ≥ 85% | ≥ 80% |
| `apps/web` | ≥ 70% | ≥ 60% |

Generated code, migrations and type-only files are excluded. Coverage is a floor, not a goal: a missing test for a
financial path blocks a release regardless of the percentage.

---

## 14. Test environments

| Environment | Database | Auth | PDF | Use |
|---|---|---|---|---|
| Local | PostgreSQL 16 on `5432`, seeded | Stub | Real Chromium | Development |
| CI | PostgreSQL service container per job | Stub | Chromium in the Playwright image | Every PR |
| Staging | Managed PostgreSQL, anonymised copy | Auth-Platform staging | Real worker | E2E, load, ZAP, release |

Tests never point at production. A staging run that needs a real account uses a dedicated test account created by
the seed job.

---

## 15. Definition of done for a feature

A feature is done only when:

1. Its UI path works with real data, including empty, loading and error states.
2. Its API contract is documented in [`0-API.md`](0-API.md) and covered by a contract test.
3. Its persistence is migrated, indexed and covered by an integration test.
4. Its authorization is enforced server-side and covered by the isolation matrix.
5. Its money path has a unit test with exact decimal assertions.
6. Its audit event exists and is asserted.
7. Its accessibility path passes axe and keyboard checks.
8. Its feature document matches the shipped behaviour.
9. `npm run ci` is green, and the test evidence is attached to the release ticket.

---

## Related docs

- [`0-CICD.md`](0-CICD.md) — how these suites run in the pipeline
- [`05-CALCULATIONS-AND-TAX.md`](05-CALCULATIONS-AND-TAX.md) — the formulas behind §7
- [`06-DOCUMENT-NUMBERING.md`](06-DOCUMENT-NUMBERING.md) — the concurrency protocol behind §8
- [`08-PDF-AND-PRINT.md`](08-PDF-AND-PRINT.md) — what the visual tests compare
- [`0-SECURITY.md`](0-SECURITY.md) — the controls behind §12
