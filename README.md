# Rumindium Invoice

Sales-document generator for freelancers, shops, service providers and small companies: quotations (SPH), sales
orders, delivery orders (surat jalan), invoices, receipts (kwitansi), and the adjustments that follow them.

**Status: P0 scaffold.** The API and Angular app run from this repository, the TypeORM schema and its migrations are
in place, and the public page, auth flow and workspace shell (invoices, company, account) are wired.

| Aspect | Decision |
|---|---|
| Web | Angular 22, standalone components, signals, SSR and prerendering |
| API | NestJS 11 REST under `/api/v1` |
| Database | PostgreSQL 16 with TypeORM 0.3; money as `Decimal`, never floating point |
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
npm run db:migrate
npm run dev
```

| Service | URL | Notes |
|---|---|---|
| Web | `http://localhost:4210` | Angular SSR; `/` public, `/login` and `/register` auth, `/dashboard` protected shell |
| API | `http://localhost:4310` | NestJS; liveness at `/api/v1/health/live` |
| Readiness | `http://localhost:4310/api/v1/health/ready` | Checks PostgreSQL; `503` until a database is reachable |
| PostgreSQL | `localhost:5432` | Expected by `.env.example`; install PostgreSQL 16 locally or point `DATABASE_URL` elsewhere |

The API opens its TypeORM connection at startup and retries a few times; if PostgreSQL stays unreachable the process
exits instead of serving requests. Readiness reports the database dependency on every call.

For the full walkthrough — PostgreSQL setup, every environment variable, Mailpit, the first account, and common
failures — see [`docs/SETUP.md`](docs/SETUP.md).

### Database

The schema is defined by the TypeORM entities in
[`apps/api/src/database/entities`](apps/api/src/database/entities), and `synchronize` stays off so migrations are the
only way the schema changes. Apply the committed migrations once PostgreSQL is reachable:

```bash
npm run db:migrate
```

The first migration is a baseline that matches the current schema. A database that already contains the tables is
recorded as migrated instead of being recreated:

```bash
npm run db:migrate --workspace @rumindium/api -- --fake
```

For schema changes during development, update the entity, then generate and apply a migration:

```bash
npm run build --workspace @rumindium/api
npm run db:migrate:generate --workspace @rumindium/api -- src/database/migrations/AddSomething
npm run db:migrate
```

## Root scripts

| Command | What it does |
|---|---|
| `npm run dev` | Runs the API and Angular app together with hot reload |
| `npm run dev:api` | API only, on `4310` |
| `npm run dev:web` | Angular only, on `4210` |
| `npm run build` | Builds the API and the web app |
| `npm run typecheck` | Typechecks both workspaces |
| `npm run lint` | ESLint plus Prettier check |
| `npm run test` | API unit tests (Vitest) |
| `npm run db:migrate` | Builds the API, then applies committed migrations |
| `npm run db:migrate:show` | Lists applied and pending migrations |
| `npm run db:migrate:revert` | Reverts the last migration |
| `npm run db:migrate:generate` | Generates a migration from entity changes |

## Repository layout

```text
apps/
  api/                 NestJS API, TypeORM entities and migrations, health endpoints, Vitest tests
    src/database/      Data source, entities, migrations and the baseline schema SQL
  web/                 Angular SSR app, public page and workspace shell
docs/                  Specification and engineering documentation
```

## Documentation

| Document | Covers |
|---|---|
| [`docs/SETUP.md`](docs/SETUP.md) | Local setup: prerequisites, PostgreSQL, environment variables, Mailpit, migrations, troubleshooting |
| [`docs/README.md`](docs/README.md) | Scope, feature matrix, architecture at a glance, canonical values |
| [`docs/0-ARCHITECTURE.md`](docs/0-ARCHITECTURE.md) | Topology, lifecycles, failure domains, ADRs |
| [`docs/0-DOCUMENT-MODEL.md`](docs/0-DOCUMENT-MODEL.md) | Shared document aggregate, snapshots, calculation and numbering rules |
| [`docs/0-API.md`](docs/0-API.md) | REST contract, errors, pagination, rate limits |
| [`docs/0-DATABASE.md`](docs/0-DATABASE.md) | Tables, indexes, transactions, retention, migrations |
| [`docs/0-DEV-TO-PRODUCTION.md`](docs/0-DEV-TO-PRODUCTION.md) | Local setup, release phases, production gate |
| [`docs/0-WEB-AND-SEO.md`](docs/0-WEB-AND-SEO.md) | Angular SSR, public routes, metadata, sitemap |
| [`docs/01-COMPANY-PROFILES.md`](docs/01-COMPANY-PROFILES.md) … [`docs/14-DOCUMENT-TEMPLATES.md`](docs/14-DOCUMENT-TEMPLATES.md) | One document per feature family |
