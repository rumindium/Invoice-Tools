# Rumindium Invoice

Sales-document generator for freelancers, shops, service providers and small companies: quotations (SPH), sales
orders, delivery orders (surat jalan), invoices, receipts (kwitansi), and the adjustments that follow them.

**Status: P0 scaffold.** The API and Angular app run from this repository, the Prisma schema v1 is in place, and the
public page plus workspace shell are wired. Document features start in P1.

| Aspect | Decision |
|---|---|
| Web | Angular 22, standalone components, signals, SSR and prerendering |
| API | NestJS 11 REST under `/api/v1` |
| Database | PostgreSQL 16 with Prisma 6; money as `Decimal`, never floating point |
| Identity | Auth-Platform (OIDC / platform SSO); a local stub for development |
| PDF | Chromium printing the application's own print route, queued in a worker |
| Guest use | Full quotation, invoice and receipt creation without an account; drafts stay in the browser |

The product is deliberately **not** an accounting system, ERP, inventory system or payment gateway. It prepares,
issues, tracks and connects sales documents; the user remains responsible for legal and tax compliance.

```text
QUOTATION / SPH ──▶ SALES ORDER ──▶ DELIVERY ORDER ──▶ INVOICE ──▶ PAYMENT ──▶ RECEIPT
                                                        │
                                                        └──▶ CREDIT / DEBIT NOTE (phase 2)
```

## Quick start

Requirements: Node.js 22 LTS and npm 10+. Local development uses npm only.

```bash
npm install
cp .env.example .env
npm run db:generate
npm run dev
```

| Service | URL | Notes |
|---|---|---|
| Web | `http://localhost:4210` | Angular SSR; `/` public, `/login` and `/register` auth, `/dashboard` protected shell |
| API | `http://localhost:4310` | NestJS; liveness at `/api/v1/health/live` |
| Readiness | `http://localhost:4310/api/v1/health/ready` | Checks PostgreSQL; `503` until a database is reachable |
| PostgreSQL | `localhost:5432` | Expected by `.env.example`; install PostgreSQL 16 locally or point `DATABASE_URL` elsewhere |

The API starts even when PostgreSQL is not running: liveness stays green and readiness reports the database as down.
The workspace status panel shows the same result.

### Database

The schema lives in [`prisma/schema.prisma`](prisma/schema.prisma). Apply the committed migration once PostgreSQL is
reachable:

```bash
npm run db:validate
npm run db:migrate
```

For schema changes during development, use `npm run db:migrate:dev -- --name <change>`.

## Root scripts

| Command | What it does |
|---|---|
| `npm run dev` | Runs the API and Angular app together with hot reload |
| `npm run dev:api` | API only, on `4310` |
| `npm run dev:web` | Angular only, on `4210` |
| `npm run build` | Generates the Prisma client, then builds API and web |
| `npm run typecheck` | Typechecks both workspaces |
| `npm run lint` | ESLint plus Prettier check |
| `npm run test` | API unit tests (Vitest) |
| `npm run db:generate` | Generates the Prisma client |
| `npm run db:validate` | Validates the Prisma schema |
| `npm run db:migrate` | Applies committed migrations |

## Repository layout

```text
apps/
  api/                 NestJS API, Prisma service, health endpoints, Vitest tests
  web/                 Angular SSR app, public page and workspace shell
prisma/
  schema.prisma        Schema v1
  migrations/          Initial PostgreSQL migration
docs/                  Specification and engineering documentation
```

## Documentation

| Document | Covers |
|---|---|
| [`docs/README.md`](docs/README.md) | Scope, feature matrix, architecture at a glance, canonical values |
| [`docs/0-ARCHITECTURE.md`](docs/0-ARCHITECTURE.md) | Topology, lifecycles, failure domains, ADRs |
| [`docs/0-DOCUMENT-MODEL.md`](docs/0-DOCUMENT-MODEL.md) | Shared document aggregate, snapshots, calculation and numbering rules |
| [`docs/0-API.md`](docs/0-API.md) | REST contract, errors, pagination, rate limits |
| [`docs/0-DATABASE.md`](docs/0-DATABASE.md) | Tables, indexes, transactions, retention, migrations |
| [`docs/0-DEV-TO-PRODUCTION.md`](docs/0-DEV-TO-PRODUCTION.md) | Local setup, release phases, production gate |
| [`docs/0-WEB-AND-SEO.md`](docs/0-WEB-AND-SEO.md) | Angular SSR, public routes, metadata, sitemap |
| [`docs/01-COMPANY-PROFILES.md`](docs/01-COMPANY-PROFILES.md) … [`docs/14-DOCUMENT-TEMPLATES.md`](docs/14-DOCUMENT-TEMPLATES.md) | One document per feature family |
