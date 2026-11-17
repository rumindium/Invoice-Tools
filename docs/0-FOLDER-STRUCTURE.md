# 0 — Folder Structure

> Layout of the Rumindium Invoice monorepo, what each package owns, and the import rules that keep the
> architecture intact.
> Last updated: November 2026

---

## 1. Repository layout

```text
rumindium-invoice/
├── apps/
│   ├── web/                        Angular SSR application (public pages, workspace, print route)
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── core/           auth, API client, guards, interceptors, layout shell
│   │   │   │   ├── shared/         buttons, inputs, dialogs, pipes, directives, money display
│   │   │   │   ├── public/         home, generators, guides, templates, legal
│   │   │   │   ├── workspace/      dashboard, companies, customers, catalog, documents, payments, settings
│   │   │   │   ├── print/          the single PDF/print layout
│   │   │   │   ├── app.routes.ts
│   │   │   │   ├── app.config.ts
│   │   │   │   └── app.routes.server.ts
│   │   │   ├── assets/             fonts, icons, runtime config schema
│   │   │   ├── styles/             tokens, reset, typography, print CSS
│   │   │   ├── main.ts
│   │   │   └── server.ts
│   │   ├── public/                 robots.txt source, favicon, social card
│   │   └── project.json
│   ├── api/                        NestJS REST server
│   │   ├── src/
│   │   │   ├── common/             guards, interceptors, filters, pipes, decorators
│   │   │   ├── config/             typed configuration module
│   │   │   ├── database/           PrismaService, transaction helper, scoped repositories
│   │   │   ├── auth/               login, callback, logout, session, CSRF
│   │   │   ├── users/              local user mirror
│   │   │   ├── workspaces/         workspace, membership, roles
│   │   │   ├── companies/          company profiles, logo upload
│   │   │   ├── customers/          customer directory
│   │   │   ├── catalog/            products and services
│   │   │   ├── document-numbering/ patterns, sequences, allocation
│   │   │   ├── documents/          editor, issuance, revisions, PDF trigger
│   │   │   │   ├── quotation/
│   │   │   │   ├── sales-order/
│   │   │   │   ├── delivery-order/
│   │   │   │   ├── invoice/
│   │   │   │   └── receipt/
│   │   │   ├── document-conversion/
│   │   │   ├── payments/
│   │   │   ├── pdf/                print-token minting, artefact lookup
│   │   │   ├── dashboard/          summary and search
│   │   │   ├── audit/              append-only audit log
│   │   │   ├── jobs/               enqueue and poll background jobs
│   │   │   ├── health/             liveness and readiness
│   │   │   ├── app.module.ts
│   │   │   └── main.ts
│   │   └── test/                   Supertest integration suites
│   └── worker/                     Node process for PDF and scheduled sweeps
│       └── src/
│           ├── jobs/               pdf-generate, overdue-sweep, retention-sweep
│           ├── renderer/           Chromium lifecycle, print-token navigation
│           └── main.ts
├── packages/
│   ├── domain/                     money, tax, totals, numbering format, lifecycle, amount in words  (no IO)
│   ├── contracts/                  Zod schemas, DTO types, route constants, error codes             (no IO)
│   ├── templates/                  layout definitions, page geometry, print CSS tokens              (no runtime)
│   └── config/                     typed environment parsing with Zod
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── tests/
│   ├── e2e/                        Playwright journeys
│   ├── load/                       k6 scripts
│   └── fixtures/                   companies, customers, catalog, documents, expected totals
├── deploy/
│   ├── docker/                     Dockerfile.web, Dockerfile.api, Dockerfile.worker
│   ├── compose/                    compose.dev.yml, compose.prod.yml
│   └── proxy/                      nginx or Caddy configuration
├── scripts/                        registration, rootless stack, maintenance
├── docs/                           this documentation set
├── .github/workflows/
├── eslint.config.js
├── .prettierrc
├── package.json                    workspaces and scripts
├── tsconfig.base.json
├── tsconfig.json
└── .env.example
```

npm workspaces are declared in the root `package.json` (`"workspaces": ["apps/*", "packages/*"]`). A package is
imported by name (`@rumindium/domain`), never by a relative path that escapes its folder.

---

## 2. Dependency rules

Enforced by ESLint `no-restricted-imports` and by `tests/architecture.test.ts`.

| From | May import | Must not import |
|---|---|---|
| `packages/domain` | `decimal.js` | Angular, NestJS, Prisma, `node:*`, `fetch`, RxJS |
| `packages/contracts` | Zod, `packages/domain` (types only) | Angular, NestJS, Prisma, `node:*` |
| `packages/templates` | nothing at runtime | Angular, NestJS, Prisma, DOM APIs |
| `packages/config` | Zod | Angular, NestJS, Prisma, app code |
| `apps/web` | `domain`, `contracts`, `templates`, `config` (public values only) | `apps/api`, `apps/worker`, `@prisma/client`, `node:*` in browser code |
| `apps/api` | all packages, `@prisma/client` | `apps/web`, Angular |
| `apps/worker` | `domain`, `contracts`, `templates`, `config`, `@prisma/client` | `apps/web`, Angular, NestJS controllers |
| `apps/*` | each other | never |

Why these rules: the browser and the API must compute identical totals, so `domain` is pure and shared. The print
route and the worker must render the same layout, so `templates` carries layout data and CSS tokens with no
framework dependency. The worker never imports a NestJS controller, so a web request cannot accidentally run
inside a background job.

---

## 3. Naming

| Thing | Convention | Example |
|---|---|---|
| Files | `kebab-case.ts`; Angular components `PascalCase.ts` | `document-totals.ts`, `InvoiceEditor.ts` |
| Test files | `*.test.ts` beside the source; Playwright in `tests/e2e/*.spec.ts` | `domain/src/totals.test.ts` |
| NestJS modules | `modules/<resource>/{controller,service,repository,module}.ts` | `documents/invoice/invoice.controller.ts` |
| Prisma models | `PascalCase` singular; tables mapped to `snake_case` plural | `Document` → `documents` |
| Database columns | `snake_case` | `grand_total`, `due_date` |
| Route paths | `kebab-case`, plural nouns, versioned | `/api/v1/companies/:companyId/invoices` |
| Query parameters | `camelCase` | `?customerId=&issueFrom=&limit=` |
| Env variables | `UPPER_SNAKE_CASE`, area prefix | `PDF_JOB_TIMEOUT_MS` |
| CSS custom properties | `--ri-<area>-<name>` | `--ri-color-brand`, `--ri-space-4` |
| Audit actions | `resource.verb` past tense | `document.issued`, `payment.voided` |
| Job kinds | `domain.action` | `pdf.generate`, `invoice.overdue-sweep` |

---

## 4. Where new code goes

| You are adding | Put it in |
|---|---|
| A new money or tax rule | `packages/domain` with a table-driven unit test; update [`05-CALCULATIONS-AND-TAX.md`](05-CALCULATIONS-AND-TAX.md) |
| A new document field | Prisma schema, `packages/contracts`, API DTO, editor form, snapshot writer, print layout |
| A new document type | `packages/domain` type and transitions, `documents/<type>/`, contracts, editor route, print label |
| A new REST endpoint | `apps/api/src/<resource>/`, schema in `packages/contracts`, row in [`0-API.md`](0-API.md) |
| A new public page | `apps/web/src/app/public/`, route entry in `app.routes.server.ts`, metadata row in [`0-WEB-AND-SEO.md`](0-WEB-AND-SEO.md) |
| A new template | `packages/templates`, preview in `apps/web/src/app/print/`, row in [`14-DOCUMENT-TEMPLATES.md`](14-DOCUMENT-TEMPLATES.md) |
| A new job kind | `apps/worker/src/jobs/`, kind constant in `packages/contracts`, row in [`0-OPERATIONS.md`](0-OPERATIONS.md) §7 |
| A new setting | `packages/config/src/schema.ts`, `.env.example`, [`0-CONFIG.md`](0-CONFIG.md) |
| A new audit action | The service that performs it; row in [`0-SECURITY.md`](0-SECURITY.md) §9 |
| A new table | `prisma/schema.prisma`, then `npm run db:migrate`; [`0-DATABASE.md`](0-DATABASE.md) |

A change to a document field is never just a form change. It touches schema, contracts, API validation, snapshot
shape, print layout and tests; the feature document lists the full path.

---

## 5. Generated and ignored paths

| Path | Generated by | Committed |
|---|---|---|
| `prisma/migrations/` | `prisma migrate dev` | Yes |
| `node_modules/` | `npm ci` | No |
| `dist/`, `.angular/` | `npm run build` | No |
| `coverage/` | `npm run test:coverage` | No |
| `playwright-report/`, `test-results/` | Playwright | No |
| `apps/web/public/robots.txt`, `sitemap.xml` | Build from `SITE_URL` | No |
| `.env`, `.env.local` | Developer | No (never) |
| `.data/` | Local storage driver | No |

---

## Related docs

- [`0-ARCHITECTURE.md`](0-ARCHITECTURE.md) — what each app does at runtime
- [`0-TESTING.md`](0-TESTING.md) — where tests live and how they run
- [`0-CONFIG.md`](0-CONFIG.md) — environment variables
- [`0-DEV-TO-PRODUCTION.md`](0-DEV-TO-PRODUCTION.md) — setup and release phases
