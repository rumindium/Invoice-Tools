# 0 — Development to Production

> How a developer runs Rumindium Invoice locally, how the product moves through release phases, and what must be
> true before production traffic is accepted.
> Last updated: November 2026

---

> **Status.** The P0 scaffold is runnable from the repository root with npm: API, Angular shell, Prisma schema and
> initial migration. Feature work starts in P1. Deployment and automation sections below remain target design.

---

## 1. Terminology

Two numbering schemes are kept apart on purpose.

| Term | Meaning | Values | Where it appears |
|---|---|---|---|
| **Phase** (`P0`–`P5`) | A product release; each adds documents and has an exit gate | `P0` foundation … `P5` adjustments | Feature matrix, release gates, test plans |
| **Stage** (`S1`–`S3`) | A deployment topology; changes how processes run, not what users can do | `S1` single host … `S3` multi-instance | Architecture, configuration, operations |

A stage is chosen by infrastructure. A phase is chosen by the release plan. A phase may run on any stage that meets
its gate.

---

## 2. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 22 LTS | Runtime for Angular SSR, NestJS and the worker |
| npm | 10+ | Workspaces and the committed lockfile |
| Docker + Compose v2 | Current stable | PostgreSQL locally; optional with the rootless stack |
| Git | 2.40+ | |
| Chromium | Installed by Playwright | Only needed for PDF and E2E work |

---

## 3. Local development

### 3.1 First run

```bash
git clone <repo-url> rumindium-invoice
cd rumindium-invoice

npm install
cp .env.example .env                          # local values only; see 0-CONFIG.md

# Start PostgreSQL 16 separately and point DATABASE_URL at it, then:
npm run db:migrate

npm run dev                                   # API and web with hot reload from the root
```

| Service | URL | Notes |
|---|---|---|
| Web | `http://localhost:4210` | Angular SSR; `/` public, `/login` and `/register` auth, `/dashboard` protected, `/print/:token` print |
| API | `http://localhost:4310` | NestJS; Swagger at `/api/docs` |
| PostgreSQL | `localhost:5432` | Database `invoice_dev` |
| Object storage | not started | `STORAGE_DRIVER=local` writes to `.data/uploads` |

Local sign-in uses `AUTH_MODE=stub`: any password is accepted for the typed email, and the first sign-in creates a
personal workspace. To use the real Auth-Platform account, start the sibling stack and register the app:

```bash
../Auth-Platform/scripts/noroot-stack.sh up
./scripts/register-app.sh
# .env: AUTH_MODE=oidc, AUTH_FLOW=platform, AUTH_ISSUER=http://localhost:5100,
#       AUTH_WEB_URL=http://localhost:3000
```

`register-app.sh` creates the `invoice` application row in Auth-Platform. The platform flow uses the hosted login
page and needs no OAuth client; `AUTH_FLOW=oidc` is for a provider that serves an authorization page and is not
required locally.

### 3.2 Database availability

The API starts without PostgreSQL: liveness stays available and readiness reports the dependency as down. Start a
PostgreSQL 16 instance on `localhost:5432` (or change `DATABASE_URL`), create the `invoice` role and `invoice_dev`
database, then run `npm run db:migrate`. The workspace status panel shows the same readiness result.

### 3.3 Daily commands

| Command | Use it when |
|---|---|
| `npm run dev` | Working on any part of the app |
| `npm run dev:web` / `dev:api` / `dev:worker` | One process only |
| `npm run test:unit` | After domain, API or component changes |
| `npm run test:integration` | After a route, query, transaction or numbering change |
| `npm run test:e2e:smoke` | Before a PR that touches the editor or issuance |
| `npm run test:a11y` | Before a PR that touches a page or shared component |
| `npm run test:load` | Before a release, or after a query change |
| `npm run db:migrate` | After editing `prisma/schema.prisma` |
| `npm run db:seed` | Reset local fixtures |
| `npm run db:studio` | Inspect local data |
| `npm run contracts:generate` | After changing a Zod schema or route |
| `npm run contracts:check` | Before pushing; compares committed OpenAPI |

### 3.4 Conventions a new developer must know

- **Contracts first.** Request and response shapes live in `packages/contracts` as Zod schemas; `nestjs-zod` makes
  them DTOs and OpenAPI, and the Angular client infers types from them. No hand-written API type.
- **Money in the domain.** `packages/domain` owns every calculation. The editor and API call the same functions;
  the API's result is authoritative.
- **Drafts are optimistic.** Save with `If-Match`; never overwrite a newer version silently.
- **Issued means frozen.** If a change would edit an issued document, it is the wrong design.
- **Guest means local.** No network call while a guest types; no analytics event carries a field value.
- **Feature docs are the spec.** A behaviour change updates its document in the same PR.
- **TypeScript strict**, no `any` in domain or contracts, no `@ts-ignore` without a linked issue.

### 3.5 Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `npm ci` fails on the lockfile | `package-lock.json` not updated | Run `npm install` once, commit the lockfile, explain in the PR |
| API starts but `/health/ready` is `503` | PostgreSQL or storage down | `docker compose … ps`; rootless: `./scripts/noroot-stack.sh status` |
| Sign-in redirects to a blank page | Auth-Platform not running or wrong `AUTH_WEB_URL` | Start the sibling stack; check the URL and app code |
| PDF job stays queued | Worker not running | `npm run dev:worker` in a second terminal |
| PDF renders unstyled | Print route blocked by the dev server or font not built | Open `/print/:token` directly; check the font assets |
| `409 DOCUMENT_VERSION_CONFLICT` while editing | Autosave raced a manual save | Reload; the conflict dialog shows the server version |
| Numbering preview shows the wrong year | Company time zone or system clock | Check `time_zone` and `TZ`; numbers use the company zone |
| `contracts:check` fails | OpenAPI not regenerated | `npm run contracts:generate`, review, commit |

---

## 4. Release phases

### 4.1 Phase table

| Phase | Name | Adds | Features | Exit gate |
|---|---|---|---|---|
| **P0** | Foundation | Monorepo, CI, config validation, health endpoints, Prisma schema v1, app shell, public home, design tokens | — | `npm run ci` green; staging deploy; home TTFB < 400 ms |
| **P1** | Standalone generator | Quotation/SPH, invoice and receipt editors; one-time seller/customer; line items; calculations; preview; browser print; guest drafts; public generator pages | F04, F05, F07 (draft/issue), F08 (browser), F12 (guest), F01/F02 inline | Financial vectors pass; 200-line recalculation < 16 ms; guest stores nothing remote; axe clean |
| **P2** | Cloud workspace | Accounts, company profiles, customer directory, catalog, numbering, drafts/history, audit, server PDF, built-in templates | F01, F02, F03, F06, F08 (server), F12 (accounts), F14 (built-ins) | Isolation matrix green; 50 parallel issues unique; PDF parity; restore drill |
| **P3** | Sales workflow | Sales orders, delivery orders, conversion graph, full lifecycle, search and dashboard | F07 (full), F09, F11 (search/dashboard) | Conversion mapping tests; every transition table-driven; list p95 ≤ 300 ms at 10,000 docs |
| **P4** | Payments | Manual payments, partial payments, receipts, balances, overdue, receivables | F10, F11 (receivables) | Payment and reversal suites; no negative balance under 20 concurrent payments; receipt parity |
| **P5** | Adjustments and statements | Credit notes, debit notes, statement of account, template configuration, reminders | F13, F14 (config) | SOA opening/closing balances match the ledger; adjustment tests; statement PDF reviewed |

A phase is not released until its gate is green on the release branch. P0 and P1 can be built by one developer; P2
onward needs the production operations in §8.

### 4.2 Deployment stages

| Stage | Topology | Introduced in | Notes |
|---|---|---|---|
| **S1** | Web, API, worker and PostgreSQL on one host (Compose) | P0 | Correct for development, CI and the first production months |
| **S2** | Web/API and worker split with independent scaling; managed PostgreSQL | P2 (before real customer data) | Rolling deploys; PITR |
| **S3** | Multiple API and worker instances behind the ingress; replica for read reports | P3/P4 (before 24×7 on-call) | No sticky sessions; sessions in PostgreSQL |

S3 is the production target from P4 onward. S1 is not acceptable for real customer data beyond a pilot.

---

## 5. Environments

| Environment | Purpose | Stage | Data | Who deploys |
|---|---|---|---|---|
| `local` | Developer machine | S1 | Seeded fixtures | Developer |
| `ci` | Pull request checks | S1 | Ephemeral service containers | CI |
| `staging` | Release candidate, E2E, load, restore drills | S2 | Anonymised copy, weekly refresh | CI on merge to `main` |
| `production` | Real users | S2 → S3 | Real; PITR | Release manager, tagged build |

Configuration is per environment ([`0-CONFIG.md`](0-CONFIG.md) §7). Secrets are never shared between staging and
production.

---

## 6. Path to production

### 6.1 Build and release

1. Merge to `main`; CI runs `npm run ci`, the smoke E2E set and the bundle budget.
2. Tag `v<major>.<minor>.<patch>` (for example `v1.0.0`).
3. Run the release pipeline: images → staging → migrations → smoke → approval → production.
4. Migrate before the new API serves traffic; migrations are expand-only.
5. Watch the dashboards for 30 minutes: error rate, issue latency, queue age, PDF failures.
6. Promote the web image last.

### 6.2 Rollback

| Change | Rollback |
|---|---|
| API/worker image | Redeploy the previous tag; safe with expand-only migrations |
| Web image | Repoint the ingress to the previous image |
| Migration | Ship a forward fix; restore is a last resort |
| Feature flag | Disable it; effective within 30 s |
| Template | Restore the row; issued snapshots are unaffected |

---

## 7. Deliberately deferred

Documented, not scheduled. A request for one starts a new design note.

| Item | Why deferred |
|---|---|
| General ledger, journals, trial balance | The product prepares sales documents, not accounting |
| Bank feeds and reconciliation | Provider integration and a security review; not needed for invoicing |
| Payment-gateway processing | PCI scope and webhook reconciliation; manual recording covers phase 1 |
| Tax filing and e-invoicing integration | Country-specific, legally sensitive, and changes per jurisdiction |
| Inventory and stock valuation | Delivery orders record what was delivered, not stock levels |
| E-signature infrastructure | Legal-grade identity and evidence are a separate product |
| Proforma, recurring, sales return, BAST, work order | Real documents, but they multiply the lifecycle before the core chain is stable |
| Multi-currency with FX | Exact multi-currency accounting is an accounting feature |
| Attachments on documents | Storage, virus scanning and retention need their own design |
| Custom HTML templates | Code execution and XSS surface; built-in layouts cover the need |
| Native mobile apps | The responsive web app is the product |

---

## 8. Production readiness gate

Production traffic starts only when every line is checked on the release candidate. Evidence goes in the release
ticket.

| # | Check | Reference | Evidence |
|---|---|---|---|
| 1 | `npm run ci` green on the tagged commit | [`0-CICD.md`](0-CICD.md) §3 | Pipeline link |
| 2 | Unit, integration, contract and security suites pass | [`0-TESTING.md`](0-TESTING.md) | Test report |
| 3 | Financial vectors pass exactly | [`0-TESTING.md`](0-TESTING.md) §7 | Test names |
| 4 | Isolation matrix passes with two workspaces | [`0-TESTING.md`](0-TESTING.md) §3 | Test report |
| 5 | 50 parallel issues produce unique numbers | [`06-DOCUMENT-NUMBERING.md`](06-DOCUMENT-NUMBERING.md) §6 | CI job |
| 6 | PDF parity and pagination baselines pass | [`0-TESTING.md`](0-TESTING.md) §9 | Baseline diff |
| 7 | Accessibility checks pass on every release page | [`0-TESTING.md`](0-TESTING.md) §10 | axe report |
| 8 | Performance targets met on staging | [`README.md`](README.md) §10 | k6/Lighthouse summary |
| 9 | Migrations run on an empty and a restored database | [`0-DATABASE.md`](0-DATABASE.md) §7 | CI job |
| 10 | Restore drill completed within RPO 15 min / RTO 2 h | [`0-OPERATIONS.md`](0-OPERATIONS.md) §6 | Drill notes |
| 11 | Auth-Platform production app registered with the exact callback | [`0-SECURITY.md`](0-SECURITY.md) §4 | App id recorded |
| 12 | Secrets set in the secret store; none in the image or bundle | [`0-CONFIG.md`](0-CONFIG.md) §12 | Secret names |
| 13 | Dashboards and alerts exist for every service | [`0-OPERATIONS.md`](0-OPERATIONS.md) §4–§5 | Dashboard links |
| 14 | Runbooks exist for the top failure modes | [`0-OPERATIONS.md`](0-OPERATIONS.md) §10 | Runbook links |
| 15 | Privacy notice, data export and account deletion tested | [`0-SECURITY.md`](0-SECURITY.md) §10 | Test report |
| 16 | Feature documents match shipped behaviour | [`README.md`](README.md) §3 | Reviewer sign-off |

A failing check blocks the release. A waiver needs the release manager's name, a reason and a dated follow-up.

---

## 9. After launch

| When | Action |
|---|---|
| First 24 hours | Staffed on-call; hourly review of error rate, issue latency and queue age |
| First week | Daily review of support tickets tagged `invoice-data`; confirm no customer data in logs |
| First month | Load test at 2× peak; review database headroom and PDF capacity |
| Every release | Re-run the readiness gate for changed items; full gate quarterly |
| Every quarter | Restore drill, access review, retention check |

---

## Related docs

- [`0-ARCHITECTURE.md`](0-ARCHITECTURE.md) — topology and failure domains
- [`0-CONFIG.md`](0-CONFIG.md) — environment variables
- [`0-CICD.md`](0-CICD.md) — pipelines and release jobs
- [`0-TESTING.md`](0-TESTING.md) — test levels and gates
- [`0-OPERATIONS.md`](0-OPERATIONS.md) — running the system after release
