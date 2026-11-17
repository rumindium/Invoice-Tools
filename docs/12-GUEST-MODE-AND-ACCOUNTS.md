# 12 — Guest Mode and Accounts

> Local, private guest drafts; Auth-Platform sign-in; workspaces and roles; what an account adds; how a guest draft
> becomes a saved document; and how data is exported or deleted.
> Feature ID `F12` · queue: `full` · phase `P1` (guest), `P2` (accounts)
> Last updated: November 2026

---

## 1. Overview

The fastest way to use Rumindium Invoice is to open a generator and type. No account, no upload, no cookie banner
for data that never leaves the device. An account adds persistence, reserved numbers, history, conversion, payments
and server PDFs.

```text
GUEST                                   ACCOUNT
browser only                            workspace in PostgreSQL
local draft + local reference           saved draft + reserved number at issue
browser print                           server PDF + archive
no history beyond this device           list, filters, conversion, payments
no identity                             Auth-Platform subject + role
```

The boundary is explicit in the UI. Guest mode never implies cloud storage.

---

## 2. What a guest can do

| Capability | Guest | Notes |
|---|---|---|
| Create a quotation/SPH | Yes | Standalone, no conversion |
| Create an invoice | Yes | No payment recording |
| Create a receipt | Yes | Standalone acknowledgement, not linked to a payment |
| Add seller and customer details | Yes | One-time fields, not saved to a directory |
| Add lines, discounts, tax, charges | Yes | Same calculation engine |
| Preview the document | Yes | Same component as the print route |
| Print / Save as PDF | Yes | Browser dialog |
| Save a local draft | Yes | IndexedDB |
| Number | Local reference only | `DRAFT-0003`, clearly labelled |
| Sales order, delivery order | No | They belong to the account workflow (P3) |
| Conversion, payments, history | No | Account features |

A guest receipt is an acknowledgement the visitor creates. The UI does not claim a payment was recorded in a
system. Account receipts are created only by recording a payment.

---

## 3. Local storage

| Item | Detail |
|---|---|
| Store | IndexedDB database `rumindium-invoice`, object store `drafts`, version 1 |
| Key | `draft:<type>:<localId>` |
| Contents | Document type, seller fields, customer fields, lines, dates, currency, tax mode, template choice, updatedAt |
| Scope | This origin, this browser profile, this device |
| Limit | 10 drafts or 5 MB, whichever comes first |
| Eviction | The oldest draft is offered for deletion, never silently removed |
| Clear | **Clear document data** removes all drafts and the local counter |
| Expiry | No automatic expiry; the visitor controls it |

The local counter for references lives in `localStorage` under `ri.guest.counter`. It is not a reserved number and
is not synchronized.

`localStorage` is used only for the counter and the UI language; document content goes to IndexedDB.

---

## 4. Privacy rules

1. No network request is made while a guest edits. The editor, preview and calculations are local.
2. No analytics event carries a field value. Page views and button clicks may be measured without document content.
3. No service worker caches a guest document for offline sync in phase 1.
4. The draft list states: “Stored on this device only. Clearing browser data deletes it.”
5. **Clear document data** requires confirmation and names what will be deleted.
6. Private browsing is supported but its storage is ephemeral; the UI does not promise recovery.
7. Saving to an account is an explicit button, not a background sync.

These rules are asserted in E2E: typing a customer name produces zero network requests containing that string.

---

## 5. Guest PDF

- **Print / Save as PDF** calls `window.print()` on the print layout.
- The browser selects the printer or “Save as PDF”; the page uses A4 print CSS.
- The preview and the printout carry a `DRAFT` watermark and the local reference.
- No server call, no token, no stored artefact.
- The UI explains that the browser controls margins and headers.

---

## 6. Accounts and sign-in

| Step | Behaviour |
|---|---|
| Sign in | Auth-Platform hosted login or the app's form, verified server-to-server |
| First sign-in | Local user mirror, personal workspace, `OWNER` membership |
| Workspace | One tenant per account in phase 1 |
| Roles | `OWNER`, `ADMIN`, `MEMBER`, `VIEWER`; phase 1 has one owner |
| Session | HttpOnly cookie, 14-day idle, 30-day absolute |
| Sign out | Session deleted, cookies cleared, platform session optionally ended |
| Account disabled | Existing session ends at next check; sign-in explains the state |

Invoice stores no password. Password reset, email verification and MFA live in Auth-Platform. A user who signs in
with the same subject on another device sees the same workspace.

### 6.1 Onboarding

1. Welcome screen with the two next actions: **Complete your company profile** and **Create your first invoice**.
2. Company form prefilled with the account name where possible.
3. Optional: add a logo and a customer.
4. First invoice opens the editor with the company selected.

Onboarding can be skipped; issuing requires a complete company profile.

### 6.2 What an account adds

- Saved companies, customers and catalog.
- Server drafts with autosave and conflict detection.
- Reserved document numbers with a configurable pattern.
- Document history, filters and search.
- Conversion between documents (P3).
- Payments, receipts, balances and receivables (P4).
- Server-generated PDFs and an archive.
- Audit trail and multiple devices.

---

## 7. Saving a guest draft

```text
1. Guest clicks "Save to an account" (or signs in from the draft list).
2. Sign-in completes; the local draft is still on the device.
3. Review: "Save this draft to your workspace?" with the document type and total.
4. Upload once: POST /companies/:companyId/invoices with the local payload.
5. The server validates and recalculates every line and total.
6. A mismatch is shown field by field; the guest may correct or discard.
7. On success, the server returns a DRAFT with a server id.
8. The local copy is deleted only after the save is confirmed.
9. The draft now has no official number until it is issued.
```

Rules:

- The upload is never automatic, never silent and never repeated.
- The local reference is discarded; the server assigns the number at issue.
- A one-time seller becomes a company only if the user confirms; otherwise the draft keeps a one-time issuer
  snapshot and cannot issue until a company is chosen.
- A one-time customer can be saved to the directory in the same review.
- A failed upload keeps the local draft and shows a retry.

---

## 8. Data export and deletion

| Request | Behaviour |
|---|---|
| Export | JSON archive of companies, customers, catalog, documents, payments and audit ids; signed URL valid 15 minutes |
| Delete account | Typed confirmation; blocked while the user is the sole owner of a workspace with documents; a job deletes data and writes a tombstone audit event |
| Delete workspace | Owner only; typed workspace name; deletes documents, customers, catalog, assets and audit |
| Clear guest data | Local action; no server involvement |
| Correct data | Edit master data; issued documents via revision, void or adjustment |

Deletion is asynchronous but starts immediately; the UI shows the job state. Backups expire on their retention
schedule; the privacy notice explains that a backup copy may exist until it rotates out.

---

## 9. Limits

| Limit | Value |
|---|---|
| Guest drafts | 10 per device or 5 MB |
| Guest document lines | 200 |
| Guest PDF | Browser-limited |
| Workspaces per user | 1 in phase 1 |
| Members per workspace | 1 in phase 1; schema ready |
| Session idle / absolute | 14 / 30 days |

---

## 10. Acceptance tests

| # | Test | Expected |
|---|---|---|
| 1 | Guest creates and reloads an invoice | Draft restored; local reference shown |
| 2 | Guest types a customer name | No network request contains the name |
| 3 | Clear document data | All drafts gone; confirmation explained the effect |
| 4 | Guest prints | Print layout with `DRAFT`; no API call |
| 5 | Guest signs in and saves | Draft uploaded once; server totals match; local copy removed |
| 6 | Server total mismatch on upload | Field-level error; local draft preserved |
| 7 | Sign out | Workspace inaccessible; guest pages still work |
| 8 | Second device | Same account sees the saved draft; guest draft does not transfer |
| 9 | Delete account with documents | Blocked until ownership is resolved; explanation shown |
| 10 | Export | Archive downloads; contains the workspace's documents |
| 11 | Session expiry | Next request returns `401`; the UI redirects to sign-in |
| 12 | Guest sales order route | Not available; no placeholder page |

---

## 11. Related docs

- [`0-SECURITY.md`](0-SECURITY.md) §4–§6 — auth flow, roles and guest privacy
- [`04-DOCUMENT-EDITOR.md`](04-DOCUMENT-EDITOR.md) — the editor both modes share
- [`0-API.md`](0-API.md) §3.2 — auth routes
- [`0-WEB-AND-SEO.md`](0-WEB-AND-SEO.md) — public generator pages
