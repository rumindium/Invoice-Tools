# 0 — Configuration

> Every environment variable Rumindium Invoice reads, its default, its validation, and how values differ between
> `local`, `ci`, `staging` and `production`.
> Last updated: November 2026

---

## 1. Rules

1. Every process parses configuration once at startup through `packages/config/src/schema.ts` with Zod.
2. A missing or invalid required value stops the process with a message naming the variable. A security setting is
   never silently defaulted.
3. Secrets come from the platform secret store. Only `.env.example` is committed; `.env` stays on the developer's
   machine.
4. Values are read once at startup; changing one requires a restart. Rate limits and feature flags may be read from
   the database every 30 seconds.
5. The browser receives only the public runtime config (§8). No secret ever reaches it.
6. `APP_ENV=production` refuses development-only modes (`AUTH_MODE=stub`, local storage driver without an explicit
   override, Swagger without `API_DOCS_ENABLED`).

---

## 2. Shared

| Variable | Required | Default | Example | Notes |
|---|---|---|---|---|
| `NODE_ENV` | no | `development` | `production` | Used by libraries |
| `APP_ENV` | yes | — | `staging` | `local`, `ci`, `staging`, `production` |
| `LOG_LEVEL` | no | `info` | `debug` | `fatal`, `error`, `warn`, `info`, `debug`, `trace` |
| `PUBLIC_ORIGIN` | yes | — | `https://invoice.example.com` | Canonical origin; links, CORS, cookies, print URLs |
| `WEB_PORT` | no | `4210` | | Angular SSR server |
| `API_PORT` | no | `4310` | | NestJS |
| `DATABASE_URL` | yes | — | `postgresql://invoice:invoice@localhost:5432/invoice_dev?schema=public` | PostgreSQL 16 |
| `DATABASE_POOL_MAX` | no | `20` | `40` | Per API instance |
| `SESSION_SECRET` | yes | — | 32+ random bytes, base64 | Signs the session id and CSRF cookie |
| `SESSION_IDLE_TTL_HOURS` | no | `336` | | 14 days |
| `SESSION_ABSOLUTE_TTL_HOURS` | no | `720` | | 30 days |
| `TRUST_PROXY` | no | `1` | | Required for correct client IP behind the ingress |
| `REQUEST_TIMEOUT_MS` | no | `30000` | | Ingress and API request timeout |
| `CORS_ORIGINS` | no | `PUBLIC_ORIGIN` | | Comma-separated; `*` is refused |
| `API_DOCS_ENABLED` | no | `false` | `true` in local/staging | Swagger UI and OpenAPI route |
| `LOG_PRETTY` | no | `true` locally | `false` | Human-readable logs only in development |

---

## 3. Identity (Auth-Platform)

| Variable | Required | Default | Notes |
|---|---|---|---|
| `AUTH_MODE` | yes | — | `oidc` in staging and production; `stub` only in local and CI |
| `AUTH_FLOW` | no | `platform` | `platform` = Auth-Platform login page + SSO handoff; `oidc` = authorization code + PKCE |
| `AUTH_ISSUER` | when `oidc` | — | Auth-Platform API origin; discovery at `/.well-known/openid-configuration` |
| `AUTH_WEB_URL` | when `platform` | — | Auth-Platform web origin; `/login?redirect=…` and `/register` |
| `AUTH_APP_CODE` | no | `invoice` | App code registered in Auth-Platform |
| `AUTH_CLIENT_ID` | when `AUTH_FLOW=oidc` | — | Confidential client for the API |
| `AUTH_CLIENT_SECRET` | when `AUTH_FLOW=oidc` | — | Secret |
| `AUTH_REDIRECT_URI` | when `AUTH_MODE=oidc` | derived | Must equal `${PUBLIC_ORIGIN}/api/v1/auth/callback` |
| `AUTH_SCOPES` | no | `openid profile email offline_access` | |
| `STUB_USER_EMAIL` | when `stub` | `dev@example.test` | Local only; any password is accepted |

`AUTH_MODE=stub` is refused when `APP_ENV` is `staging` or `production`. `AUTH_FLOW=platform` requires
`AUTH_WEB_URL` and no client credentials. `AUTH_FLOW=oidc` requires `AUTH_ISSUER`, `AUTH_CLIENT_ID`,
`AUTH_CLIENT_SECRET` and an absolute `AUTH_REDIRECT_URI` on `PUBLIC_ORIGIN`.

The Invoice app is registered in Auth-Platform by `scripts/register-app.sh`, which creates or updates the `invoice`
row. Local development starts with `AUTH_MODE=stub`; real sign-in is opt-in.

---

## 4. Storage

| Variable | Required | Default | Notes |
|---|---|---|---|
| `STORAGE_DRIVER` | no | `local` | `local` or `s3` |
| `ALLOW_LOCAL_STORAGE` | no | `false` | Must be `true` to run the local driver in production |
| `STORAGE_LOCAL_ROOT` | when `local` | `.data/uploads` | Outside the web root; never served directly |
| `S3_ENDPOINT` | when `s3` | — | S3-compatible endpoint |
| `S3_BUCKET` | when `s3` | — | `rumindium-invoice-prod` |
| `S3_REGION` | when `s3` | `us-east-1` | |
| `S3_ACCESS_KEY_ID` | when `s3` | — | Secret |
| `S3_SECRET_ACCESS_KEY` | when `s3` | — | Secret |
| `S3_FORCE_PATH_STYLE` | no | `false` | `true` for MinIO or SeaweedFS |
| `ASSET_MAX_BYTES` | no | `2097152` | 2 MB logo limit |
| `ASSET_CACHE_MAX_AGE_SECONDS` | no | `3600` | Private browser cache for logos |
| `SIGNED_URL_TTL_SECONDS` | no | `300` | PDF download links |

`local` is allowed in production only with an explicit `ALLOW_LOCAL_STORAGE=true` and a mounted persistent volume;
the default production configuration is `s3`.

---

## 5. API, PDF and jobs

| Variable | Required | Default | Notes |
|---|---|---|---|
| `PDF_WORKER_CONCURRENCY` | no | `2` | Parallel Chromium pages per worker |
| `PDF_JOB_TIMEOUT_MS` | no | `120000` | Includes browser start |
| `PDF_RENDER_MEMORY_MB` | no | `1024` | Container memory budget; validated ≥ 512 |
| `PDF_PRINT_TOKEN_TTL_SECONDS` | no | `300` | 5 minutes |
| `PDF_MAX_PAGES` | no | `100` | Reject larger documents |
| `PRINT_READY_TIMEOUT_MS` | no | `20000` | Wait for `[data-print-ready]` |
| `PLAYWRIGHT_BROWSERS_PATH` | no | `/ms-playwright` | Worker image only |
| `JOB_POLL_INTERVAL_MS` | no | `2000` | Worker claim cadence |
| `JOB_MAX_ATTEMPTS` | no | `3` | PDF and other jobs |
| `JOB_LOCK_TIMEOUT_MS` | no | `600000` | A stale lock returns the job to the queue |
| `OVERDUE_SWEEP_CRON` | no | `10 * * * *` | Hourly; each company's local midnight is handled in code |
| `RETENTION_SWEEP_CRON` | no | `30 2 * * *` | Daily |
| `IDEMPOTENCY_TTL_HOURS` | no | `24` | |

---

## 6. Limits and rate limits

| Variable | Default | Notes |
|---|---|---|
| `RATE_AUTH_PER_MIN` | `10` | Per IP + email hash |
| `RATE_PUBLIC_PER_MIN` | `120` | Per IP; public pages and print payload |
| `RATE_READ_PER_MIN` | `600` | Per user |
| `RATE_WRITE_PER_MIN` | `120` | Per user |
| `RATE_PAYMENT_PER_10MIN` | `30` | Per user |
| `RATE_PDF_PER_10MIN` | `20` | Per user |
| `RATE_PDF_CONCURRENT` | `5` | Per user |
| `RATE_UPLOAD_PER_10MIN` | `20` | Per user |
| `LIMIT_DOCUMENT_ITEMS` | `200` | Lines per document |
| `LIMIT_COMPANIES_PER_WORKSPACE` | `5` | Phase 1 |
| `LIMIT_PAGE_SIZE` | `100` | API maximum; validated ≤ 100 |
| `LIMIT_CUSTOMER_PAGE_SIZE` | `100` | |
| `LIMIT_ACTIVE_DRAFT_PER_USER` | `50` | Anti-abuse guard for guest import and autosave |

---

## 7. Per-environment values

| Variable | local | ci | staging | production |
|---|---|---|---|---|
| `APP_ENV` | `local` | `ci` | `staging` | `production` |
| `AUTH_MODE` | `stub` | `stub` | `oidc` | `oidc` |
| `AUTH_FLOW` | `platform` | `platform` | `platform` | `platform` |
| `STORAGE_DRIVER` | `local` | `local` | `s3` | `s3` |
| `API_DOCS_ENABLED` | `true` | `false` | `true` | `false` |
| `LOG_LEVEL` | `debug` | `info` | `info` | `info` |
| `PUBLIC_ORIGIN` | `http://localhost:4210` | `http://localhost:4210` | `https://staging.invoice.example.com` | `https://invoice.example.com` |
| `PDF_WORKER_CONCURRENCY` | `1` | `1` | `2` | `4` |
| `DATABASE_POOL_MAX` | `10` | `10` | `20` | `40` |
| `S3_FORCE_PATH_STYLE` | `true` | `true` | `false` | `false` |

Secret values are set per environment in the secret store and are never shared between staging and production.

---

## 8. Web runtime configuration

The Angular build is environment-agnostic. At container start, `docker-entrypoint.sh` writes
`/usr/share/nginx/html/assets/config.json` (or the SSR static root) from environment variables. The browser fetches
it before bootstrapping; SSR reads the same values from `process.env`.

| Key | Example | Notes |
|---|---|---|
| `apiOrigin` | `https://invoice.example.com` | Same origin in production; `http://localhost:4310` locally when the dev server proxies are off |
| `authWebUrl` | `https://auth.example.com` | Account and sign-in links |
| `siteUrl` | `https://invoice.example.com` | Canonical origin used by the client for share links |
| `environment` | `production` | Display and error reporting |
| `version` | `1.4.0` | Written from the git tag |
| `sentryDsn` | empty | Error reporting is optional; no PII is attached |
| `features` | `{ "creditNotes": false }` | Public flags only; never an authorization decision |

`SITE_URL` is also read at build time by the prerender step to emit canonical links, the sitemap and `robots.txt`.
Set it to the real public origin before a production build.

---

## 9. Validation

`packages/config` enforces:

- URLs parse as absolute; `PUBLIC_ORIGIN` uses `https` unless `APP_ENV=local`.
- `SESSION_SECRET` decodes to at least 32 bytes.
- `SESSION_IDLE_TTL_HOURS < SESSION_ABSOLUTE_TTL_HOURS`.
- `AUTH_MODE=stub` only in `local` or `ci`.
- `AUTH_MODE=oidc` requires `AUTH_ISSUER`; `AUTH_FLOW=platform` requires `AUTH_WEB_URL`; `AUTH_FLOW=oidc` requires
  the client id and secret.
- `AUTH_REDIRECT_URI` equals `${PUBLIC_ORIGIN}/api/v1/auth/callback` when set.
- `STORAGE_DRIVER=s3` requires endpoint, bucket, region, key and secret.
- `STORAGE_DRIVER=local` in production requires `ALLOW_LOCAL_STORAGE=true`.
- `CORS_ORIGINS` does not contain `*`.
- `LIMIT_PAGE_SIZE` is between 1 and 100.
- `PDF_RENDER_MEMORY_MB >= 512` and `PDF_PRINT_TOKEN_TTL_SECONDS` is between 60 and 900.
- `DATABASE_URL` uses the `postgresql://` scheme.

A unit test loads every `.env.example` variant and asserts the schema accepts it; an invalid variant test asserts
the process refuses to start.

---

## 10. Adding a variable

1. Add the field to `packages/config/src/schema.ts` with type, default and validation.
2. Add the line to `.env.example` with a comment.
3. Add a row to the relevant table in this document.
4. If it is a secret, add it to the secret store for every environment before merging.
5. If the browser needs it, add it to the public runtime config and prove it is not sensitive.

---

## Related docs

- [`0-SECURITY.md`](0-SECURITY.md) — secret handling and rotation
- [`0-DEV-TO-PRODUCTION.md`](0-DEV-TO-PRODUCTION.md) — where each environment's values are set
- [`0-OPERATIONS.md`](0-OPERATIONS.md) — limits that protect the platform
