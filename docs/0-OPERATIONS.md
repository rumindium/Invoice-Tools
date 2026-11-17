# 0 — Operations

> Service map, capacity, observability, SLOs, backup and restore, scheduled jobs, incidents and runbooks for
> Rumindium Invoice.
> Last updated: November 2026

---

## 1. Ownership and on-call

| Area | Owner | Responsibility |
|---|---|---|
| Web and public SEO | Frontend lead | SSR, prerender, metadata, bundle budget |
| API and domain | Backend lead | Documents, numbering, payments, correctness |
| Database | Backend lead + DBA | Migrations, backup, restore, performance |
| Worker and PDF | Platform lead | Chromium, queue, storage |
| Identity | Auth-Platform owner | Sign-in, app access, account lifecycle |
| Infrastructure | Platform lead | Ingress, TLS, secrets, monitoring |

Phase 1 is maintained by a small team without a 24×7 rota. The on-call rota starts at phase P3, before external
users depend on conversion and payment workflows. Until then, alerts page the maintainer on duty during business
hours, and a documented escalation exists for a total outage.

---

## 2. Service map

| Service | Kind | Depends on | User impact when down |
|---|---|---|---|
| `web` | Node 22, Angular SSR | API, static assets | Public pages and print route unavailable; API still works |
| `api` | Node 22, NestJS | PostgreSQL, storage, Auth-Platform | No reads or writes; existing sessions remain valid |
| `worker` | Node 22, Chromium | PostgreSQL, web print route, storage | PDFs queue; issuing and payments still work |
| `postgres` | Managed or container | disk | Total outage |
| `storage` | S3-compatible | network | Logos and PDFs fail; editing continues |
| `ingress` | nginx/Caddy | web, api | Total outage |
| Auth-Platform | Sibling service | its own stack | New sign-ins fail; guest mode unaffected |

Critical path for revenue: **browser → ingress → api → postgres**. The worker is asynchronous and never blocks
issuance.

---

## 3. Scaling and capacity

### 3.1 Topology by stage

| Stage | Web | API | Worker | Database | Notes |
|---|---|---|---|---|---|
| S1 | 1 | 1 | 1 | container, 2 vCPU / 4 GB | Development and first production months |
| S2 | 2 | 2 | 1–2 | managed, 2 vCPU / 8 GB | Split tiers; rolling deploys |
| S3 | 2+ | 2–6 | 2–4 | managed, 4 vCPU / 16 GB + replica | Multi-instance; PITR |

### 3.2 Sizing reference

| Load | Web | API | Worker | Database |
|---|---|---|---|---|
| < 100 documents/day | 1 × 1 vCPU / 1 GB | 1 × 2 vCPU / 2 GB | 1 × 2 vCPU / 2 GB | 1 × 2 vCPU / 4 GB |
| < 2,000 documents/day | 2 × 1 vCPU / 1 GB | 2 × 2 vCPU / 4 GB | 2 × 2 vCPU / 2 GB | 1 × 4 vCPU / 8 GB |
| < 20,000 documents/day | 2 × 2 vCPU / 2 GB | 4 × 4 vCPU / 8 GB | 4 × 2 vCPU / 2 GB | 1 primary + 1 replica, 8 vCPU / 16 GB |

The database is the first bottleneck; PDF rendering is the second. Measure before scaling either.

### 3.3 Limits that protect the platform

| Limit | Value | Enforced in |
|---|---|---|
| PDF concurrency per worker | 2 | Worker |
| PDF job timeout | 120 s | Worker |
| PDF pages | 100 | API + worker |
| Lines per document | 200 | API |
| API database pool | 20 per instance | Prisma |
| List page size | 100 | API |
| Logo size | 2 MB | API |
| Request timeout | 30 s | Ingress |
| Idempotency key TTL | 24 h | Database |

### 3.4 Capacity review

Before each phase gate:

1. Run the k6 suite at 2× the expected peak.
2. Record database CPU, connection count, slow queries, queue age and PDF p95.
3. Add an index or a cache only for a measured query; no speculative caching.
4. Raise the API replica count only after the database has headroom.

---

## 4. Observability

### 4.1 Logs

Structured JSON via pino, one line per request:

```json
{"level":"info","time":"2026-11-17T10:00:00.000Z","requestId":"req_01J…","workspaceId":"wsp_01J…","userId":"usr_01J…","method":"POST","path":"/api/v1/companies/cmp_01J…/invoices/doc_01J…/issue","status":200,"durationMs":184}
```

Never logged: names, emails, addresses, item descriptions, totals, cookies, tokens, signed URLs. Errors log a code,
a request id and a stack trace with paths only in non-production.

### 4.2 Metrics

| Metric | Type | Labels |
|---|---|---|
| `http_requests_total` | counter | method, route, status |
| `http_request_duration_seconds` | histogram | route |
| `ssr_render_duration_seconds` | histogram | route |
| `document_issue_duration_seconds` | histogram | type |
| `document_issued_total` | counter | type, status |
| `payment_recorded_total` | counter | method |
| `invoice_outstanding_amount` | gauge | currency |
| `invoice_overdue_count` | gauge | — |
| `job_queue_depth` | gauge | kind, status |
| `job_age_seconds` | gauge | kind |
| `job_duration_seconds` | histogram | kind |
| `pdf_duration_seconds` | histogram | pages_bucket |
| `pdf_failures_total` | counter | reason |
| `numbering_conflicts_total` | counter | type |
| `db_pool_in_use` | gauge | instance |
| `storage_errors_total` | counter | operation |

Metric labels never contain a document id, customer id or email.

### 4.3 Traces

OpenTelemetry spans for HTTP → service → Prisma, and for worker jobs. Trace ids are attached to logs as
`requestId`. Sampling is 10% in production, 100% in staging; a failing request is always sampled.

### 4.4 Dashboards

1. **Platform:** request rate, error rate, p50/p95 latency, saturation, PostgreSQL connections.
2. **Documents:** issued per type, issue latency, numbering conflicts, draft saves.
3. **Money:** outstanding and overdue per currency, payments recorded, voided receipts.
4. **Worker:** queue depth and age, PDF p95, failure reasons, Chromium restarts.
5. **Web:** SSR TTFB, cache hit rate, Core Web Vitals from real users (if RUM is enabled).

---

## 5. SLOs and alerts

### 5.1 Service level objectives

| SLO | Target | Window |
|---|---|---|
| API availability | 99.9% | 30 days |
| Public page availability | 99.9% | 30 days |
| API read latency p95 | ≤ 200 ms (lists ≤ 300 ms) | 7 days |
| Issue latency p95 | ≤ 500 ms | 7 days |
| Issue success rate | ≥ 99.9% | 30 days |
| Payment success rate | ≥ 99.9% | 30 days |
| PDF success within 5 minutes | ≥ 99% | 7 days |
| Worker queue age p95 | ≤ 2 minutes | 7 days |
| Backup success | 100% | 30 days |

### 5.2 Alerts

| Alert | Condition | Severity |
|---|---|---|
| API error rate | 5xx > 1% for 5 minutes | SEV1 |
| API down | `/health/live` fails on all instances for 2 minutes | SEV1 |
| Database down | `/health/ready` fails for 2 minutes | SEV1 |
| Disk | > 85% on database or storage volume | SEV1 |
| Queue age | Oldest queued job > 10 minutes | SEV2 |
| PDF failure rate | > 5% over 15 minutes | SEV2 |
| Numbering conflict | Any `numbering_conflicts_total` increase | SEV2 |
| Payment anomaly | Payment error rate > 2% over 10 minutes | SEV2 |
| Auth failures | > 50 `invalid_credentials` per minute | SEV2 |
| Backup failure | Nightly backup missing or failed | SEV2 |
| Restore drill failure | Daily automated verification or quarterly full drill fails | SEV2 |
| Certificate expiry | < 21 days | SEV3 |

Alerts link to the runbook in §10. Every alert has an owner and a threshold that has been reviewed against real
traffic.

---

## 6. Data integrity and backup

### 6.1 Integrity checks

A read-only job runs hourly and reports, without fixing:

| Check | Expected |
|---|---|
| Duplicate document numbers | 0 |
| Issued document with null number, snapshots or `issued_at` | 0 |
| `grandTotal` ≠ `subtotal + taxTotal + shipping + additional + chargesTax` | 0 |
| Invoice `balanceDue` ≠ `grandTotal − amountPaid` | 0 |
| Invoice `amountPaid` > `grandTotal` | 0 |
| Payment without a receipt, or receipt without a payment | 0 |
| Receipt total ≠ payment amount | 0 |
| Document relation crossing workspaces | 0 |
| Issued document with a null company or workspace | 0 |

A non-zero count pages the backend lead; nothing is auto-corrected. Corrections are explicit, audited scripts.

### 6.2 Backup

| Item | Policy |
|---|---|
| PostgreSQL | Managed PITR, 7-day window; nightly logical dump retained 30 days; monthly dump retained 12 months |
| Object storage | Versioning on logos and PDFs; lifecycle rules; cross-region replication when the plan allows |
| Configuration and secrets | Secret store backups per provider policy; no secret in the database dump |
| Encryption | At rest by the provider; dumps encrypted with a managed key |

RPO is 15 minutes, RTO is 2 hours. The published numbers are verified by the drill, not assumed.

### 6.3 Restore

```bash
# 1. Create a scratch database from the latest PITR timestamp or dump.
createdb invoice_restore
pg_restore --clean --if-exists -d invoice_restore /backups/invoice-latest.dump

# 2. Point a staging API at the scratch database.
DATABASE_URL=postgresql://…/invoice_restore npm run start:api

# 3. Run migrations and smoke checks.
npx prisma migrate deploy
npm run test:e2e:smoke -- --base-url http://localhost:4310

# 4. Verify counts against the source before declaring success.
```

A quarterly drill records: backup timestamp, restore duration, row counts, the critical journey result, and any
gap. A failed drill blocks the next release.

---

## 7. Scheduled jobs

| Job | Schedule | Purpose | Idempotent |
|---|---|---|---|
| `pdf.generate` | on demand | Render one document revision | Yes, by document + revision |
| `invoice.overdue-sweep` | hourly at :10 | Mark issued/partially paid invoices past due in the company time zone | Yes |
| `retention.sweep` | daily 02:30 | Purge drafts, sessions, tokens, jobs, old audit, unreferenced assets | Yes |
| `integrity.check` | hourly at :40 | Read-only invariant report | Yes |
| `backup.verify` | daily 04:00 | Confirm the dump exists and restores into a scratch schema | Yes |

Jobs use `FOR UPDATE SKIP LOCKED`, a lock timeout and three attempts. A stale lock is returned to the queue by the
next worker after `JOB_LOCK_TIMEOUT_MS`.

---

## 8. Incident response

### 8.1 Severity

| Severity | Definition | Response |
|---|---|---|
| SEV1 | Data loss, cross-tenant exposure, payments/issuance down for everyone | Immediate page, incident channel, updates every 30 minutes |
| SEV2 | Major feature degraded, PDF backlog, one tenant blocked | Acknowledge in 30 minutes, updates hourly |
| SEV3 | Minor degradation, single user issue, alert noise | Next business day |
| SEV4 | Cosmetic or documentation issue | Backlog |

### 8.2 Steps

1. **Acknowledge** the alert and open an incident note with time, severity and commander.
2. **Stabilise:** roll back the last release, disable a flag, or stop the worker before diagnosing.
3. **Diagnose** from dashboards, logs and the integrity report; do not query document content without need.
4. **Communicate** to affected users in plain language; never promise a recovery time that is not measured.
5. **Resolve** and verify with the critical journey.
6. **Review** within five business days: timeline, cause, blast radius, what worked, actions with owners.

### 8.3 Data incidents

If cross-workspace access or data loss is suspected: preserve logs, revoke sessions, disable the affected route,
notify the data owner, and follow the applicable privacy regulation. Do not delete evidence while fixing.

### 8.4 Security incidents

Follow [`0-SECURITY.md`](0-SECURITY.md) §13. Rotate secrets, invalidate sessions, preserve the audit trail, and
publish a disclosure if customer data was affected.

---

## 9. Operator access

- Operators use named accounts with MFA; no shared credentials.
- Production database access is read-only by default; a write requires a break-glass approval recorded in the
  incident note.
- Operators can see metadata (ids, statuses, counts) but not customer names, addresses or document content unless
  the incident requires it and the approval is recorded.
- Every operator query against a document table is logged by the database audit extension where available.
- Access is reviewed quarterly; departed staff are removed the same day.

---

## 10. Runbooks

| Runbook | First actions |
|---|---|
| API down | Check ingress → instances → `/health/live`; roll back the last image; check database reachability |
| Database down | Fail over to the managed standby; if unavailable, restore PITR to a scratch instance and repoint |
| Queue backlog | Check worker logs and Chromium crashes; scale workers; confirm the print route is up |
| Numbering stalled | Inspect `document_number_sequences` locks; kill only the blocking session after approval; verify no duplicate |
| PDF failures | Reproduce one token locally; check fonts, Chromium memory and print-route health; retry failed jobs |
| Auth outage | Confirm Auth-Platform status; existing sessions keep working; disable sign-in prompts, keep guest mode |
| Storage full | Free expired exports and old PDFs (never issued ones); expand the volume; check lifecycle rules |
| Bad release | Roll back the image; do not reverse migrations; open a forward-fix ticket |
| Certificate expiry | Renew at the ingress; verify HSTS and the callback URL before the old certificate expires |
| Accidental deletion | Stop the retention job; restore the affected rows from PITR into a scratch database; verify before merging |

Each runbook lives in `docs/runbooks/` during implementation with exact commands for the current provider. This
document names the first actions; it does not pretend to know a provider's console.

---

## 11. Maintenance

| Cadence | Task |
|---|---|
| Weekly | Dependency and image review; alert noise review; queue and storage trend |
| Monthly | Worker image rebuild; access review; cost review; slow-query review |
| Quarterly | Restore drill; secret rotation review; runbook test; capacity review |
| Yearly | Architecture review; retention policy review; privacy notice review |

Maintenance windows are announced for anything that can interrupt issuance or payments. A migration that locks a
large table is scheduled outside business hours and has a rollback plan.

---

## Related docs

- [`0-ARCHITECTURE.md`](0-ARCHITECTURE.md) — failure domains behind these runbooks
- [`0-DATABASE.md`](0-DATABASE.md) — tables, locks and retention
- [`0-CICD.md`](0-CICD.md) — deploy and rollback pipeline
- [`0-SECURITY.md`](0-SECURITY.md) — incident and privacy handling
- [`0-CONFIG.md`](0-CONFIG.md) — limits and schedules
