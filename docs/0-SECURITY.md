# 0 — Security

> Threat model, authentication, authorization, guest privacy, upload safety, PDF sandboxing, headers, secrets,
> logging and data-subject handling for Rumindium Invoice.
> Last updated: November 2026

---

## 1. Assets

| Asset | Why it matters | Where it lives |
|---|---|---|
| Issued documents and snapshots | Commercial record; customer PII; legal evidence | PostgreSQL |
| Draft documents | Unannounced prices and customer data | PostgreSQL |
| Session cookies and CSRF secrets | Account takeover | Browser + PostgreSQL |
| Document number sequences | Financial integrity; duplicate or reused numbers | PostgreSQL |
| PDFs | Copies of issued documents | Object storage |
| Logos and customer data | PII and brand assets | Object storage / PostgreSQL |
| Auth-Platform credentials | Identity and app access | Platform secret store |
| Audit log | Non-repudiation and incident response | PostgreSQL |
| Guest drafts | PII on the visitor's device | Browser IndexedDB only |

---

## 2. Threat model

| Threat | Vector | Control | Verified by |
|---|---|---|---|
| Cross-workspace read | Guessing or replaying a document/customer id | Every query includes `workspace_id`; foreign id answers `404` | IDOR matrix in `tests/security` |
| Cross-workspace write | Patching another company's document | Company scope resolved from the session; `companyId` in the path is checked | Integration tests with two workspaces |
| Total tampering | Editing the DOM or API body to lower a total | Server recalculates every line and compares; `422 TOTAL_MISMATCH` | Contract and E2E tests |
| Number race | Two issues at the same instant | Row lock on the sequence; unique index; retry on conflict | 50 parallel issue test |
| Session theft | XSS or a copied cookie | HttpOnly, Secure, SameSite=Lax, `__Host-` prefix, CSP, no token in storage | Header tests, ZAP baseline |
| CSRF | Cross-site form post | Double-submit token + `Origin` check + SameSite | CSRF test suite |
| Login brute force | Credential stuffing | Auth-Platform policy, 10/min IP+email limit, generic errors | Rate-limit tests |
| ID enumeration | Error differences between missing and foreign ids | `404` for both; no role disclosure in errors | Contract tests |
| Stored XSS | Customer name, notes, terms, item description | Angular escaping; no `innerHTML` for user text; CSP; PDF text is escaped | XSS payload fixtures |
| Logo upload abuse | Polyglot file, decompression bomb, SVG script | Magic-byte check, 2 MB limit, 2048 px limit, re-encode to WebP/PNG, no SVG | Upload fuzz tests |
| PDF SSRF | Tricking the worker into opening an internal URL | Worker opens only `PUBLIC_ORIGIN/print/<token>`; token is minted server-side | Worker unit test |
| Print data leak | Shared or leaked print URL | 5-minute expiry, scoped to one revision, `no-store`, revoked after the job | Print route tests |
| Guest data leak | Silent upload or analytics on form fields | No network calls while typing; no analytics on inputs; explicit save only | E2E network assertions |
| Mass assignment | Sending `workspaceId`, `status`, `documentNumber` in a body | Zod strips unknown keys; status and number are action-only | Contract tests |
| Payment double-charge | Retried request after a timeout | `Idempotency-Key`, invoice row lock, balance check | Payment retry test |
| Reused voided number | Voiding then reissuing | Sequence is monotonic; numbers are never returned | Numbering tests |
| Audit tampering | Editing history to hide an action | Append-only table; no update/delete route; restricted operator access | Review + DB grants |
| Dependency compromise | Malicious package | Lockfile, `npm ci`, Dependabot, `npm audit`, image scan, provenance review | CI |
| Secret leak | Committed `.env` or a secret in the bundle | Secret store, `.gitignore`, build scan for known secret patterns | CI secret scan |
| Data loss | Accidental delete or database failure | Issued documents immutable, soft-deleted drafts, PITR backups, restore drills | Restore test |

Out of scope for phase 1: nation-state attackers, physical access to the host, and legal-grade e-signature
non-repudiation (the audit log is evidence, not a qualified signature).

---

## 3. Controls summary

| Area | Control |
|---|---|
| Identity | Auth-Platform; Invoice stores no passwords |
| Session | Opaque 32-byte token, SHA-256 in the database, HttpOnly cookie |
| Authorization | App permission + workspace role, checked in the service layer |
| Tenant isolation | `workspaceId` in every repository predicate; foreign id = `404` |
| Transport | HTTPS only, HSTS, secure cookies |
| Input | Zod validation, `whitelist`, `forbidNonWhitelisted`, max lengths |
| Output | Angular interpolation, no raw HTML for user data, PDF text escaping |
| Money | Server-side decimal recalculation; no client authority |
| Files | Magic bytes, re-encode, size and pixel limits, private storage |
| PDF | Token-bound URL, sandboxed Chromium, no network beyond the app origin |
| Rate limits | Per IP and per user, enforced server-side |
| Audit | Append-only, 12-month retention, ids and actions only |
| Secrets | Secret store, rotation, no browser exposure |
| Backups | Encrypted, PITR, quarterly restore drill |

---

## 4. Authentication

### 4.1 Sign-in flow (platform)

```text
1. The browser opens /login.
2. GET /api/v1/auth/login?returnTo=/app
     → 302 to Auth-Platform /login?redirect=<PUBLIC_ORIGIN>/api/v1/auth/callback&app=invoice
3. The user signs in or registers on Auth-Platform.
4. Auth-Platform redirects back with a single-use handoff code.
5. The API exchanges the code server-to-server, validates issuer, audience, nonce and state.
6. The API upserts the local user mirror (subject, email, display name).
7. The first sign-in creates a personal workspace and an OWNER membership.
8. The API creates a session row, sets the HttpOnly cookie and the readable CSRF cookie, then 302 to returnTo.
```

`returnTo` is a path on this origin only. State and nonce are single-use and expire in 10 minutes. The callback
never renders tokens in the URL after the redirect.

### 4.2 OIDC flow

`AUTH_FLOW=oidc` uses authorization code + PKCE against `AUTH_ISSUER`. The client secret stays server-side. ID
tokens are validated for signature, issuer, audience, expiry and nonce. The same session is then created.

### 4.3 Session

| Property | Value |
|---|---|
| Cookie name | `rinv_session` on localhost, `__Host-rinv_session` elsewhere |
| Flags | `HttpOnly; Secure; SameSite=Lax; Path=/` |
| Value | 32 random bytes, base64url; only its SHA-256 is stored |
| Idle expiry | 14 days, slid at most once per 5 minutes |
| Absolute expiry | 30 days |
| Logout | Deletes the row, clears both cookies, optionally ends the platform session |
| Rotation | A new session id on privilege change (sign-in, workspace switch) |

The CSRF cookie (`rinv_csrf`) is readable by JavaScript and is **not** HttpOnly; the matching value must be sent
in `X-CSRF-Token` on every `POST`, `PATCH` and `DELETE`. The server compares the header with the hash stored on the
session and checks `Origin`/`Sec-Fetch-Site` for unsafe methods.

### 4.4 Password and account lifecycle

Password hashing, reset, email verification, MFA and account lockout are Auth-Platform concerns. Invoice never
receives a password beyond the login POST proxy, never logs it, and never stores it. Account deletion is requested
through the app and executed by a job that deletes or anonymises workspace data according to §10.

---

## 5. Authorization

Two layers are checked on every request:

1. **App access** from the Auth-Platform snapshot: `invoice.read`, `invoice.write`, `invoice.admin`. A missing
   permission answers `403 FORBIDDEN`.
2. **Workspace role** from `workspace_members`: `OWNER`, `ADMIN`, `MEMBER`, `VIEWER`.

| Action | Owner | Admin | Member | Viewer |
|---|---|---|---|---|
| View documents, customers, catalog | ✓ | ✓ | ✓ | ✓ |
| Create/edit drafts | ✓ | ✓ | ✓ | — |
| Issue documents | ✓ | ✓ | ✓ | — |
| Record payments | ✓ | ✓ | ✓ | — |
| Void invoices/receipts | ✓ | ✓ | — | — |
| Manage customers and catalog | ✓ | ✓ | ✓ | — |
| Manage companies and logo | ✓ | ✓ | — | — |
| Configure numbering and templates | ✓ | ✓ | — | — |
| Read audit log | ✓ | ✓ | — | — |
| Archive workspace / manage members | ✓ | — | — | — |

Phase 1 has one owner; the matrix is enforced in the service layer from day one so member invitations are
additive.

### 5.1 Tenant isolation

- The session resolves to exactly one workspace; the client never supplies it.
- Company-scoped routes load the company by `(id, workspace_id)`. A mismatch is `404 NOT_FOUND`.
- Every child query (customers, items, documents, payments, audit) carries the same workspace predicate.
- A document relation cannot cross workspaces; the conversion service checks both sides.
- Assets are scoped by workspace; the storage key includes the workspace id.
- Integration tests run every route with a second workspace's ids and assert `404`.

### 5.2 Permission checks are server-side

Angular route guards improve the experience but are not a security boundary. The API repeats every check. A
hidden button is not a control.

---

## 6. Guest mode and privacy

- Guest drafts live in IndexedDB under a namespaced key (`ri.guest.v1`). They are never uploaded while the visitor
  types.
- No analytics event contains a field value. Page views and button clicks may be measured; seller, customer, item
  and price data are never sent to analytics.
- The UI states, in plain language, that data is stored on this device and is lost when browser data is cleared,
  and offers **Clear document data** with a confirmation.
- Guest PDF uses the browser print dialog. No server call is made.
- Saving to an account is an explicit action. The upload carries the local draft, the server recalculates all
  totals, and the local copy is deleted only after a successful save.
- A guest draft has a local reference (`DRAFT-0003`), clearly labelled as not a reserved number.
- Private browsing and cleared storage are honest failure modes: the UI does not promise recovery.

Full behaviour is in [`12-GUEST-MODE-AND-ACCOUNTS.md`](12-GUEST-MODE-AND-ACCOUNTS.md).

---

## 7. Uploads

| Rule | Value |
|---|---|
| Allowed types | PNG, JPEG, WebP (no SVG in phase 1) |
| Size | ≤ 2 MB |
| Pixels | ≤ 2048 × 2048 after decode |
| Verification | Magic bytes, not the `Content-Type` header or file extension |
| Processing | Re-encode with `sharp`, strip EXIF and ICC metadata, normalise orientation |
| Storage | Private bucket or local root outside the web root; key includes the workspace |
| Serving | Authenticated API route or short-lived signed URL |
| Filename | Never trusted; stored as a content hash |
| Antivirus | Optional hook; the re-encode removes executable payloads, and no upload is ever executed |

An upload is rejected with `415 UNSUPPORTED_MEDIA_TYPE` or `413 PAYLOAD_TOO_LARGE`; the reason is safe to show.

---

## 8. PDF sandbox

The worker is the highest-risk component because it runs a browser.

- It opens exactly one URL: `${PUBLIC_ORIGIN}/print/${token}`. The token is minted by the API for one document and
  revision; the worker cannot choose another origin.
- Chromium runs as a non-root user in a container with a read-only filesystem, a memory cap and a 120-second job
  timeout.
- Navigation is blocked to any origin other than `PUBLIC_ORIGIN`; requests to other hosts are aborted.
- The print route requires no cookie; the token is the only credential and expires in 5 minutes.
- Page count is capped at 100; the rendered output is capped at 20 MB.
- The worker never reads the database for document content beyond the job payload; it fetches the frozen snapshot
  from the print route.
- Job payloads contain ids and revision numbers, not customer data.
- A failed render is retried at most three times, then marked failed; it never blocks issuance.

---

## 9. Logging, audit and privacy

Logs are structured JSON with `requestId`, `workspaceId` (id only), `userId` (id only), route, status and
duration. They never contain names, emails, addresses, item descriptions, totals, tokens or cookies.

| Action | Audit event |
|---|---|
| Company/customer/item created, updated, archived | `company.created`, `customer.updated`, `catalog.archived` |
| Document created, saved, issued, revised | `document.created`, `document.issued`, `document.revised` |
| Quotation accepted/rejected/expired | `quotation.accepted`, … |
| Conversion | `document.converted` with source and target ids |
| Payment recorded | `payment.recorded` with invoice, payment and receipt ids |
| Receipt voided | `receipt.voided` with reason |
| Invoice voided | `invoice.voided` with reason |
| Numbering changed | `numbering.updated` with old and new pattern |
| Template changed | `template.updated` |
| Audit exported | `audit.exported` |

Audit rows contain ids, actions, previous/next status and a reason, never document content. The IP is retained 90
days, then nulled.

---

## 10. Data subject requests

| Request | Behaviour |
|---|---|
| Export my data | A JSON archive of companies, customers, catalog, documents, payments and audit ids, downloaded from a signed URL valid 15 minutes |
| Delete my account | Requires a typed confirmation; blocks while another member owns workspace data; a job deletes documents, payments, customers, catalog, assets and the user mirror, then records a tombstone audit event with no PII |
| Delete a workspace | Owner only; requires the workspace name; issued documents are deleted with it, as stated in the confirmation |
| Guest data | **Clear document data** in the UI; clearing browser storage also removes it |
| Correction | Customer and company fields can be edited; issued documents are corrected through a revision, void or adjustment, not by rewriting history |
| Retention | Audit 12 months; sessions 30 days; jobs 7 days; draft previews 24 hours; issued documents until deletion |

The product provides fields and layouts for tax and legal requirements but does not provide legal or tax advice.
The privacy notice and terms are linked from the footer and the sign-up flow.

---

## 11. HTTP security headers

```text
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
  img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self';
  form-action 'self'; object-src 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
```

`style-src 'unsafe-inline'` is required by Angular's style binding; scripts are never inline. The print route has
its own stricter policy and no session cookie.

---

## 12. Secrets

| Secret | Custodian | Rotation |
|---|---|---|
| `SESSION_SECRET` | Secret store | Every 90 days; invalidates sessions |
| `AUTH_CLIENT_SECRET` | Secret store | Per Auth-Platform policy |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | Secret store | Every 90 days |
| Database credentials | Secret store / managed database | Every 90 days |
| Sentry DSN | Public runtime config | Not a secret |

Secrets are never logged, never committed, never placed in Angular assets, and never shared between staging and
production. A build-time scan fails the pipeline if a known secret pattern appears in `dist/`.

---

## 13. Vulnerability management

- `npm audit --omit=dev` and Dependabot run weekly; a critical vulnerability blocks a release until patched or
  waived with a dated reason.
- Container images are scanned (Trivy) on build; the worker image is rebuilt monthly even without a code change.
- A dependency is added only with a lockfile entry, a licence check and a reason in the pull request.
- Security headers and the ZAP baseline scan run nightly against staging.
- A disclosure address is published in `SECURITY.md`; reports are acknowledged within two business days.
- The audit log and backups are tested for restore every quarter.

---

## Related docs

- [`0-API.md`](0-API.md) — auth routes and error codes
- [`12-GUEST-MODE-AND-ACCOUNTS.md`](12-GUEST-MODE-AND-ACCOUNTS.md) — guest storage and account lifecycle
- [`08-PDF-AND-PRINT.md`](08-PDF-AND-PRINT.md) — print tokens and worker behaviour
- [`0-OPERATIONS.md`](0-OPERATIONS.md) — incident response and backup
- [`0-CONFIG.md`](0-CONFIG.md) — secret and security settings
