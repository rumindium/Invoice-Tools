# 0 — CI/CD

> Pipelines, migration ordering, rollout, rollback and image policy for Rumindium Invoice.
> Last updated: November 2026
>
> **Deferred from P0.** The current scaffold runs locally with npm and has no pipeline configured. This document is
> kept as the target design for a later delivery phase.

---

## 1. Principles

1. Every merge to `main` is deployable to staging; every tag is deployable to production.
2. The same commands run locally and in CI once automation is added.
3. Migrations are forward-only and compatible with the previous app version for one release.
4. No secret is available to a pull request from a fork.
5. A failing financial, isolation or contract test blocks the merge; a flaky test is fixed or quarantined with an
   owner and a date, never ignored silently.
6. Images are immutable, tagged by commit, and promoted rather than rebuilt.

---

## 2. Repository layout for pipelines

```text
.github/workflows/
├── ci.yml            pull request and main branch
├── nightly.yml       full E2E, load, visual PDF, ZAP, dependency audit
└── release.yml       tag → images → staging → smoke → production approval → production

deploy/
├── docker/
│   ├── Dockerfile.web
│   ├── Dockerfile.api
│   └── Dockerfile.worker
├── compose/
│   ├── compose.dev.yml
│   └── compose.prod.yml
└── proxy/
    └── nginx.conf
```

---

## 3. Pull request pipeline (`ci.yml`)

```text
1.  checkout
2.  setup Node 22 with npm cache
3.  npm ci
4.  npx prisma generate               # client before typecheck and tests
5.  npm run lint
6.  npm run typecheck
7.  npm run test:unit                 # domain, API unit, Angular unit
8.  start PostgreSQL 16 service
9.  npx prisma migrate deploy
10. npm run test:integration          # real database
11. npm run contracts:check           # committed OpenAPI matches the routes
12. npm run build                     # Angular SSR + API + worker
13. npm run test:e2e:smoke            # Playwright, Chromium only
14. npm run check:bundle              # public JS budget
15. secret scan and dependency audit (non-blocking for low severity)
```

### 3.1 Caching

- npm cache keyed by `package-lock.json`.
- Playwright browser cache keyed by the Playwright version.
- Angular build cache disabled in CI; a cached build can hide a missing import.

### 3.2 Branch protection

- `main` requires a green `ci` check, one review, and no unresolved conversation.
- Force-push and deletion are disabled.
- A change to `prisma/migrations/` also requires a review from the database owner.

---

## 4. Nightly pipeline (`nightly.yml`)

Runs at 02:00 UTC against `main` and against staging.

| Job | What it proves |
|---|---|
| Full E2E | Critical journey, guest journey, isolation journey |
| Visual PDF | Print-route baselines, both locales, 1/40/200 lines |
| Load | k6 document list, save, issue, dashboard, payment |
| Accessibility | axe on all public and workspace pages |
| Security | ZAP baseline, IDOR matrix, header checks |
| Dependency audit | `npm audit`, Trivy image scan |
| Backup verification (weekly) | Restore last night's backup into a scratch database and run migrations + smoke |

A nightly failure opens an issue with the failing job, the commit and the first useful log line. It does not
block unrelated merges, but it blocks the next release until resolved or waived.

---

## 5. Release pipeline (`release.yml`)

```text
tag vX.Y.Z
  → build three images from the tagged commit
  → sign and push to the registry
  → deploy to staging
  → prisma migrate deploy on staging
  → run the release E2E suite on staging
  → require manual approval for production
  → production: backup checkpoint → migrate → API → worker → web
  → post-deploy smoke
  → announce the release
```

### 5.1 Migration ordering

1. Take a database backup or confirm the managed PITR checkpoint.
2. Run `prisma migrate deploy` with the **new** code image but before any new instance serves traffic.
3. Start new API instances; keep old ones until health checks pass.
4. Deploy the worker (it tolerates both schema versions for one release).
5. Promote the web bundle last.

Migrations must be expand-only for one release: a new nullable column, a new table, a new index. A contract
migration (dropping a column) waits for the next release.

### 5.2 Zero-downtime expectations

- Health checks gate traffic; the ingress removes an instance before it stops.
- API instances are stateless; sessions live in PostgreSQL, so no sticky sessions are needed.
- The worker drains its current job before shutdown (`SIGTERM`, 30-second grace).
- The web SSR process has no local state; a restart costs one cold request.

---

## 6. Deployment and rollout

| Stage | Topology | Trigger |
|---|---|---|
| Staging | S2: web, api, worker, managed PostgreSQL, staging bucket | Merge to `main` |
| Production | S2 first, S3 when the API runs more than one instance | Tag + manual approval |

Production rollout is rolling by default. A canary (10% of traffic for 10 minutes) is used for releases that touch
issuance, payments or numbering. The canary is judged on error rate, issue latency and PDF failure rate.

---

## 7. Post-deploy checks

Run within 5 minutes of the rollout:

| Check | Pass condition |
|---|---|
| `/api/v1/health/live` | `200` on every instance |
| `/api/v1/health/ready` | `200`; database and storage reachable |
| Sign-in | A test account signs in and loads the workspace |
| Create + issue | A test invoice issues with a number and queues a PDF |
| PDF | The PDF downloads and contains the right number and total |
| Payment | A test payment records and the invoice status changes |
| Print | `/print/{token}` loads with `data-print-ready` |
| Public page | Home returns `200`, canonical and title present |
| Error rate | Below 1% for 15 minutes |
| Queue age | Oldest queued job below 2 minutes |

A failed check stops the rollout and triggers rollback (§8).

---

## 8. Rollback

| Change | Rollback |
|---|---|
| API/worker image | Redeploy the previous tag; safe because migrations are expand-only |
| Web bundle | Repoint the CDN/ingress to the previous image |
| Migration | Do not run a reverse SQL script. Ship a forward fix; restore from PITR only as a last resort |
| Feature flag | Turn it off in configuration; effective after the next config read (≤ 30 s) |
| Bad template | Restore the previous template row; issued documents keep their snapshot and are unaffected |

A rollback is recorded in the release ticket with the trigger, the version restored and the follow-up owner.

---

## 9. Environments and configuration

| Environment | Config source | Secrets | Database |
|---|---|---|---|
| Local | `.env` | Local values | Docker or rootless PostgreSQL |
| CI | Workflow env | Ephemeral service credentials | Service container |
| Staging | Deployment env + secret store | Staging secrets | Managed, anonymised copy |
| Production | Deployment env + secret store | Production secrets | Managed, PITR |

The complete variable list and per-environment values are in [`0-CONFIG.md`](0-CONFIG.md). The web image reads
public runtime configuration at start, so one image serves every environment.

---

## 10. Container images

| Image | Base | Contents | Size target |
|---|---|---|---|
| `invoice-web` | `node:22-alpine` | Angular SSR server, static assets, fonts | ≤ 250 MB |
| `invoice-api` | `node:22-alpine` | Compiled NestJS, Prisma client, migrations | ≤ 300 MB |
| `invoice-worker` | `mcr.microsoft.com/playwright` (Node 22) | Worker, Chromium, fonts | ≤ 1.2 GB |

Rules:

- Multi-stage builds; no dev dependencies in the runtime layer.
- Run as a non-root user with a read-only root filesystem where possible.
- `HEALTHCHECK` for web and API; the worker reports liveness through its process and a heartbeat row.
- Pin base image digests in the release pipeline; rebuild the worker monthly for Chromium security updates.
- No source maps, `.env`, test fixtures or repository history in the image.

---

## 11. Dependency management

- `package-lock.json` is committed; CI uses `npm ci`.
- Dependabot checks weekly for npm and monthly for base images.
- A major upgrade is its own pull request with the full suite and a rollback note.
- A new dependency needs a reason, a licence check and a bundle-size note in the pull request.
- `npm audit` high/critical findings block a release until patched or waived with a dated reason and an owner.

---

## 12. Pipeline failures

| Symptom | Likely cause | Action |
|---|---|---|
| `contracts:check` fails | Route or schema changed without regenerating OpenAPI | Run `npm run contracts:generate`, review the diff, commit |
| Integration tests fail only in CI | Time zone or locale difference | Pin `TZ=UTC` and the Node ICU build; never depend on the host locale |
| Playwright cannot launch Chromium | Missing system libraries | Use the official Playwright image; do not install browsers ad hoc |
| PDF baseline diff | Font not bundled or Chromium version changed | Confirm the font files, then update the baseline with a reviewed diff |
| Migration fails on staging | Applied out of order or a lock timeout | Stop the rollout; inspect `_prisma_migrations`; fix forward |
| Smoke fails after deploy | Wrong runtime config or missing secret | Check `/assets/config.json` and the secret names, then roll back if needed |
| Flaky concurrency test | Test database not isolated | Give each worker its own schema/database; never share state |

---

## Related docs

- [`0-DEV-TO-PRODUCTION.md`](0-DEV-TO-PRODUCTION.md) — phases, stages and the readiness gate
- [`0-TESTING.md`](0-TESTING.md) — what each pipeline step runs
- [`0-OPERATIONS.md`](0-OPERATIONS.md) — monitoring and incident response
- [`0-CONFIG.md`](0-CONFIG.md) — environment values
