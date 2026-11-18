# Local setup

Everything needed to run Rumindium Invoice on one machine: PostgreSQL, the NestJS API, the Angular SSR app, and a
local mail catcher for activation and password-reset links.

The repository is an npm workspace. `apps/api` holds the API, `apps/web` the Angular app, and `scripts/` the helpers
that `npm run dev` uses. There is one `.env` at the repository root; both apps read it from there.

## 1. Prerequisites

| Tool | Version | Why |
|---|---|---|
| Node.js | 22.22.3 or newer | Required by the root `engines` field; Angular 22 and NestJS 11 both need a current LTS |
| npm | 10 or newer | `packageManager` pins npm 10.9.9 |
| PostgreSQL | 16 | The schema uses `jsonb`, `timestamptz` and `numeric`; `synchronize` is off, so migrations build the schema |
| Docker | any recent version | Optional. Only used to start Mailpit automatically for `npm run dev` |

Ports used locally:

| Port | Process |
|---|---|
| `4210` | Angular dev server (`ng serve`) |
| `4310` | API (`/api/v1`) |
| `5432` | PostgreSQL |
| `1025` | SMTP endpoint the API sends to (Mailpit by default) |
| `8025` | Mailpit inbox UI |

If a port is already taken, change the matching variable in `.env` (`WEB_PORT`, `API_PORT`, `SMTP_PORT`) and keep
`CORS_ORIGINS`, `PUBLIC_ORIGIN` and the web app's `apiOrigin` in step with it.

## 2. Install and configure

```bash
npm install
cp .env.example .env
```

Then edit `.env` if your database or mail server is not on the defaults. `.env` is git-ignored; `.env.example` is
the committed template and the place to record any new variable.

### Environment variables

| Variable | Default | Used by | Notes |
|---|---|---|---|
| `NODE_ENV` | `development` | API | `production` enables the `__Host-` session cookie, requires HTTPS, and makes `SMTP_HOST` and `MAIL_FROM` mandatory |
| `APP_ENV` | `local` | API | `local`, `ci`, `staging` or `production` |
| `APP_VERSION` | `0.1.0` | API | Reported by the health endpoints |
| `LOG_LEVEL` | `debug` | API | `fatal`, `error`, `warn`, `info`, `debug` or `trace` |
| `WEB_PORT` | `4210` | Angular dev server | `ng serve` also passes the port explicitly |
| `PUBLIC_ORIGIN` | `http://localhost:4210` | API | Origin used to build activation and reset links, so it must be reachable from the browser |
| `API_PORT` | `4310` | API | Listen port |
| `CORS_ORIGINS` | `http://localhost:4210` | API | Comma-separated list; the API sends credentials, so no wildcard |
| `DATABASE_URL` | `postgresql://invoice:invoice@localhost:5432/invoice_dev?schema=public` | API, TypeORM CLI | Standard PostgreSQL connection string |
| `SMTP_HOST` | `localhost` | API | Mailpit in development, your provider in production |
| `SMTP_PORT` | `1025` | API | Mailpit listens on 1025; providers usually use 587 |
| `SMTP_SECURE` | `false` | API | `true` for implicit TLS (usually port 465) |
| `SMTP_USER` | empty | API | Empty means no SMTP authentication |
| `SMTP_PASSWORD` | empty | API | Only read when `SMTP_USER` is set |
| `MAIL_FROM` | `Rumindium Invoice <no-reply@rumindium.local>` | API | Must be an address your SMTP provider allows |

The API validates this file with Zod at startup and prints every problem before exiting, so a typo shows up as a
readable message rather than a crash later.

The web app reads its API origin from `apps/web/public/assets/config.json`:

```json
{ "apiOrigin": "http://localhost:4310" }
```

It falls back to `http://localhost:4310` when the file is missing. Point it at the API origin whenever you change
the API port or host.

### PostgreSQL

Create the role and database that `.env.example` expects:

```bash
psql -U postgres <<'SQL'
CREATE ROLE invoice WITH LOGIN PASSWORD 'invoice';
CREATE DATABASE invoice_dev OWNER invoice;
SQL
```

Any reachable PostgreSQL 16 works instead — change `DATABASE_URL` and skip the commands above. The API opens its
connection during startup and retries a few times; if PostgreSQL stays unreachable the process exits instead of
serving requests. `GET /api/v1/health/live` answers as soon as the process is up, while
`GET /api/v1/health/ready` checks the database and returns `503` until it reconnects.

## 3. Create the schema

The schema lives in the TypeORM entities under `apps/api/src/database/entities`, and `synchronize` stays off.
Migrations are the only way tables change:

```bash
npm run db:migrate      # builds the API, then applies pending migrations
npm run db:migrate:show # lists applied and pending migrations
```

The baseline migration matches the current schema, so a database that already has the tables can be recorded as
migrated instead of recreated:

```bash
npm run db:migrate --workspace @rumindium/api -- --fake
```

For a schema change, edit the entity, build, generate a migration and apply it:

```bash
npm run build --workspace @rumindium/api
npm run db:migrate:generate --workspace @rumindium/api -- src/database/migrations/AddSomething
npm run db:migrate
```

Read the generated file before applying it: TypeORM writes both the `up` and the `down` path, and a rename often
turns into a drop plus a create.

## 4. Mail in development

`npm run dev` starts Mailpit alongside the API and the web app:

```bash
npm run dev
```

`scripts/dev-mailpit.mjs` first checks whether something already listens on `1025` and reuses it, which is what
happens when you run Mailpit yourself. Otherwise it starts the `axllent/mailpit:latest` container as
`rinv-mailpit`, publishes SMTP on `127.0.0.1:1025` and the inbox on `http://localhost:8025`, and waits for the SMTP
port before reporting ready. Without Docker it stops with a message telling you to start an SMTP server or install
Docker.

Open `http://localhost:8025` to read every message the API sends. The Mailpit HTTP API can clear the inbox between
tests:

```bash
curl -X DELETE http://localhost:8025/api/v1/messages
```

Outside `npm run dev`, start Mailpit yourself and keep `SMTP_HOST=localhost` / `SMTP_PORT=1025`:

```bash
docker run --rm -p 127.0.0.1:1025:1025 -p 127.0.0.1:8025:8025 axllent/mailpit:latest
```

Production never uses Mailpit. Set `NODE_ENV=production` and fill `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`,
`SMTP_USER`, `SMTP_PASSWORD` and `MAIL_FROM` with your provider's values; the API refuses to start in production
without `SMTP_HOST` and `MAIL_FROM`.

## 5. Run the app

```bash
npm run dev
```

`concurrently` starts three processes with prefixed output: `mail` (Mailpit), `api` (NestJS watch mode) and `web`
(`ng serve` with SSR).

| URL | What |
|---|---|
| `http://localhost:4210` | Public landing page |
| `http://localhost:4210/register` | Create an account |
| `http://localhost:4210/login` | Sign in |
| `http://localhost:4210/dashboard` | Workspace shell: dashboard, invoices, company, account |
| `http://localhost:4310/api/v1/health/live` | API liveness |
| `http://localhost:4310/api/v1/health/ready` | API readiness (database included) |
| `http://localhost:8025` | Mailpit inbox |

Individual processes:

```bash
npm run dev:api   # API only, port 4310
npm run dev:web   # Angular only, port 4210
npm run dev:mail  # Mailpit only
```

## 6. First run through the product

1. Open `/register` and create an account. The API stores the user unverified and sends an activation link to
   Mailpit; registration does not sign you in.
2. Open `http://localhost:8025`, click the activation link (it points at `PUBLIC_ORIGIN`), and the browser lands on
   `/verify-email`. A valid link both verifies the address and signs you in.
3. `/dashboard`, `/documents`, `/invoices/new`, `/company` and `/account` are behind the session guard. Directly
   loading one of those URLs in a fresh browser redirects to `/login?returnTo=…`; use the in-app navigation or sign
   in first.
4. `/account` holds the display name and the password form. Changing the password signs out every other session and
   keeps the current one.
5. "Forgot password" on `/login` sends a reset link that expires after one hour. Activation links expire after 24
   hours, sessions after 7 days, and both mail kinds have a 60-second resend cooldown per user.

Sessions are httpOnly cookies (`rinv_session` in development, `__Host-rinv_session` with `Secure` in production), so
the API and the web app must share a browser-visible origin setup: keep `CORS_ORIGINS` correct and serve production
over HTTPS.

## 7. API surface

Everything is under `/api/v1`.

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register`, `POST /auth/verify-email`, `POST /auth/verify-email/resend`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `PATCH /auth/me`, `POST /auth/change-password`, `POST /auth/forgot-password`, `POST /auth/reset-password` |
| Company | `GET /companies`, `GET /companies/current`, `POST /companies`, `PATCH /companies/:id`, `DELETE /companies/:id` |
| Customers | `GET /customers`, `GET /customers/summary`, `GET /customers/:id`, `POST /customers`, `PATCH /customers/:id`, `DELETE /customers/:id`, `GET /customers/:id/contacts`, `POST /customers/:id/contacts`, `PATCH /customers/:id/contacts/:contactId`, `DELETE /customers/:id/contacts/:contactId` |
| Items | `GET /items`, `GET /items/summary`, `GET /items/:id`, `POST /items`, `PATCH /items/:id`, `DELETE /items/:id` |
| Units | `GET /units`, `POST /units`, `DELETE /units/:id` |
| Documents | `GET /documents`, `GET /documents/summary`, `POST /documents`, `GET /documents/:id`, `PUT /documents/:id`, `POST /documents/:id/status`, `DELETE /documents/:id`, `GET /documents/:id/pdf`, `GET /documents/:id/follow-ups`, `POST /documents/:id/follow-ups`, `PATCH /documents/:id/follow-ups/:followUpId`, `DELETE /documents/:id/follow-ups/:followUpId` |
| Audit | `GET /audit-events` (workspace activity log: sign-ins, creates, updates, deletes) |
| Health | `GET /health/live`, `GET /health/ready` |

Server messages are in Indonesian; the web app translates the ones it shows through
`apps/web/src/app/core/http-error.ts`.

## 8. Everyday commands

| Command | What it does |
|---|---|
| `npm run dev` | Mailpit, API and web app together |
| `npm run build` | Builds the API and the web app |
| `npm run typecheck` | Typechecks both workspaces |
| `npm run lint` | ESLint plus a Prettier check |
| `npm run format` | Rewrites files with Prettier |
| `npm run test` | API unit tests (Vitest) |
| `npm run db:migrate` | Builds the API, then applies pending migrations |
| `npm run db:migrate:show` | Lists applied and pending migrations |
| `npm run db:migrate:revert` | Reverts the last migration |
| `npm run db:migrate:generate` | Generates a migration from entity changes |

The API build deletes `dist/` first, and the migration CLI runs the compiled data source in `dist/database`, which
is why the migration scripts build before they run. Start the API with `npm run dev:api` (watch mode) while
developing; `npm run start --workspace @rumindium/api` runs the compiled output.

## 9. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| API exits right after start with `Invalid environment configuration` | A missing or malformed value in `.env`; the message names the variable and the rule it broke |
| `/api/v1/health/ready` returns `503` | PostgreSQL is not reachable at `DATABASE_URL`; check that the server runs, the database exists and the credentials work |
| `ECONNREFUSED` in the browser console, "Unable to connect to the API" in the UI | The API is not running on the origin in `apps/web/public/assets/config.json` |
| `403` on API calls from the browser | `CORS_ORIGINS` does not include the web origin, or it was set to `*` (credentials require an explicit origin) |
| No mail arrives and `[mail]` exits with a Docker message | Mailpit and Docker are both unavailable; start any SMTP server on `SMTP_PORT` or install Docker |
| Activation link opens `localhost:4210` instead of your host | `PUBLIC_ORIGIN` still points at the default; set it to the origin users actually visit |
| Activation or reset link says it is invalid | The link is older than 24 hours (activation) or 1 hour (reset), was already used, or a newer link replaced it |
| Login answers `403 EMAIL_NOT_VERIFIED` | The account exists but the activation link was never opened; use "resend activation" or read the link in Mailpit |
| `/documents` or `/account` bounces to `/login` on a hard reload | The server-side guard cannot see the session cookie on that request; sign in and navigate in-app |
| Migration generation produces an empty file | The entities were not rebuilt into `dist`; run `npm run build --workspace @rumindium/api` first |

## 10. Resetting local data

The database holds only local data. To start from an empty schema:

```bash
npm run db:migrate:revert --workspace @rumindium/api   # repeat for each applied migration
npm run db:migrate
```

Or drop and recreate the database, then migrate again:

```bash
psql -U invoice -d postgres -c 'DROP DATABASE invoice_dev;'
psql -U invoice -d postgres -c 'CREATE DATABASE invoice_dev;'
npm run db:migrate
```

Clear Mailpit separately with `curl -X DELETE http://localhost:8025/api/v1/messages`. Neither step touches
anything outside the local machine.
