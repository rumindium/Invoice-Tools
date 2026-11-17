# Rumindium Invoice — To-Do

## What is left
The web app has a working English UI, functional local authentication, a mock invoice dashboard/list/generator, and a company profile card, but invoices are still sample data and the generator does not save or issue documents; company profiles and uploaded logos are stored only in browser `localStorage`, with the placeholder asset in `public/images`; there is no invoice API, server-side numbering, payment/status workflow, PDF output, email delivery, file upload endpoint, automated browser test suite, CI pipeline, or production deployment configuration. Quotation and good receipt features are intentionally out of scope.

## Goals
Make Rumindium Invoice a focused, production-ready invoicing app for small businesses: secure accounts with persistent workspaces, a company profile and logo that survive across devices, server-authoritative invoice creation and lifecycle management, downloadable professional PDFs, automated verification, and a deployable, operable stack that keeps document data in PostgreSQL and uploaded files on local storage instead of a cloud file service.

## AI production commands

### Command 1 — Persist company profiles and invoice data
Implement the backend for company profiles and invoices: move company name, address, phone, and logo out of `localStorage` into PostgreSQL, store uploaded logos in a dedicated local upload directory with server-side type/size validation, expose authenticated CRUD endpoints scoped to the current workspace, and add migrations plus API tests. Remove the frontend mock fallback only after the real endpoints are wired and loading/error states are covered.

### Command 2 — Complete the invoice lifecycle
Finish the invoice domain end to end: validate items, tax, and totals on the server, generate sequential invoice numbers per workspace, support draft/sent/paid/overdue states and payment records, connect the Angular dashboard, invoice list, and generator to the API, and enforce workspace ownership on every read and write. Replace all mock invoice data and document the state transitions and numbering rules.

### Command 3 — Add production PDF and print output
Build a reliable invoice PDF/print flow that uses the saved company profile and local logo, includes consistent IDR formatting and tax breakdowns, and can be previewed, downloaded, and printed from the invoice detail page. Add rendering tests for totals and profile data, keep generated files on local storage, and define what happens when a logo or profile is missing.

### Command 4 — Harden security and reliability
Harden the production boundary: add rate limiting, session rotation and expiry checks, CSRF/Origin protection for mutations, a strict CORS allowlist, validated DTOs, upload limits, safe error responses, and audit logging without leaking secrets. Add tests for signed-out access, foreign-workspace access, malformed uploads, expired sessions, and duplicate requests, and document the security assumptions and recovery steps.

### Command 5 — Prepare CI, deployment, and operations
Add the production delivery path: GitHub Actions or equivalent CI for lint, typecheck, API/web builds, migrations, and tests; a seeded staging environment; health checks and smoke tests; HTTPS and reverse-proxy configuration; PostgreSQL backups and restore drills; centralized logs and error monitoring; and a deployment/rollback runbook. Remove development defaults from production configuration and verify a complete register → company profile → create invoice → PDF → paid flow on the deployed environment.
