# 11 — Dashboard and Search

> Receivables, overdue invoices, quotation conversion, recent documents, filtered lists and cursor search across a
> workspace.
> Feature ID `F11` · queue: `api` · phase `P3` (search and dashboard), `P4` (receivables)
> Last updated: November 2026

---

## 1. Overview

The dashboard answers three questions in one screen: what is owed to me, what is late, and what needs attention.
Search answers “where is that document?” without loading the whole workspace.

```text
DASHBOARD (as of now)                     SEARCH (scoped, paginated)
outstanding per currency                  type · status · customer · number
overdue count and amount                  issue/due date range · currency
quotations sent / accepted                free text: number, reference, customer
recent documents                          cursor pages, stable order
```

All figures are computed from issued documents and recorded payments, never from a manually maintained summary.

---

## 2. Dashboard cards

| Card | Definition | Currency |
|---|---|---|
| Outstanding receivables | Σ `balanceDue` of invoices in `ISSUED`, `PARTIALLY_PAID`, `OVERDUE`, as of now | Per currency |
| Overdue | Σ `balanceDue` where `dueDate < today` and balance > 0 | Per currency |
| Issued invoices | Count of invoices issued in the selected range | Per currency |
| Overdue invoices | Count of invoices past due with a balance | Per currency |
| Quotations sent | Count of quotations with status `SENT`, `ACCEPTED`, `REJECTED` in range | — |
| Quotations accepted | Count of `ACCEPTED` in range, with acceptance rate | — |
| Recent documents | Last 10 documents by `updatedAt`, any status | — |

Rules:

- **Never add currencies together.** The response is an array per currency; the UI shows one section per currency
  and does not display a combined total.
- Outstanding is an as-of-now figure, not limited to the selected date range. The range applies to counts and
  quotations.
- Voided invoices and voided receipts are excluded.
- Drafts are excluded from receivables.
- A partially paid invoice contributes its remaining balance, not its grand total.
- The acceptance rate is `accepted / (sent + accepted + rejected)`, excluding drafts and expired.

---

## 3. Date range and time zone

| Input | Default | Notes |
|---|---|---|
| `from` | First day of the current month | Company time zone |
| `to` | Today | Company time zone |
| `currency` | All | Optional filter for a single-currency view |
| `asOf` | Server now | Returned in the response for clarity |

Business dates are compared as dates in the company time zone. A payment recorded at 23:30 Jakarta time belongs to
that Jakarta date, not the UTC date.

---

## 4. Lists and filters

### 4.1 Document list

| Filter | Values |
|---|---|
| `type` | `QUOTATION`, `SALES_ORDER`, `DELIVERY_ORDER`, `INVOICE`, `RECEIPT` |
| `status` | Per type; invalid combinations are rejected |
| `customerId` | Scoped to the company |
| `q` | Number, reference or customer name substring |
| `issueFrom`, `issueTo` | Dates |
| `dueFrom`, `dueTo` | Dates |
| `currency` | ISO code |
| `includeDrafts` | Default true for the owner; viewers see issued only |
| `sort` | `newest`, `oldest`, `issue-desc`, `issue-asc`, `number-asc`, `number-desc`, `due-asc` |
| `limit`, `cursor` | Cursor pagination |

The list returns a summary per document: id, type, number, status, dates, customer name, currency, grand total,
balance, version.

### 4.2 Search behaviour

- Case-insensitive substring, with `%` and `_` escaped.
- Searches `document_number`, `reference_number` and the customer name through a join.
- Trigram indexes keep it fast; a search that would scan the whole table is bounded by the workspace and a limit.
- Empty query returns the normal sorted list.
- Search is always scoped to the session's workspace; there is no cross-tenant search.
- A search for a foreign id returns nothing, not a permission error.

### 4.3 Pagination

- Cursor only, default 25, max 100.
- The cursor encodes the sort keys and the last id; it is opaque and bound to the sort.
- `total` is the count for the filtered query, used for the list header; it is not a page count.
- Inserting a document during paging does not shift the page.

---

## 5. Empty, loading and error states

| State | UI |
|---|---|
| No documents at all | “Create your first invoice” with the create action |
| No results for a filter | “No documents match these filters” with **Clear filters** |
| Dashboard with no invoices | Cards show 0; a short explanation of what will appear |
| Loading | Skeleton rows and cards; the layout does not jump |
| Error | Inline retry with a request id; filters are preserved |
| Currency with no activity | The currency section is omitted, not shown as 0 |

---

## 6. Performance

| Query | Target |
|---|---|
| Document list, 50 rows, 10,000 documents | p95 ≤ 300 ms |
| Dashboard, 10,000 documents | p95 ≤ 400 ms |
| Customer search | p95 ≤ 250 ms |
| Count for the filtered list | Included in the budget; no separate blocking call |

Indexes: `(company_id, created_at desc, id desc)`, `(company_id, issue_date desc, id desc)`,
`(company_id, status, due_date)` partial on `balance_due > 0`, `(company_id, customer_id, issue_date desc)`, and
trigram indexes on number, reference and customer name.

The dashboard is computed with aggregate queries, not by loading every invoice into memory. No materialized view in
phase 1; add one only after a measured regression.

---

## 7. Permissions

- `read` sees the dashboard, lists and search.
- A `viewer` sees issued documents only; drafts are excluded.
- A `member` sees drafts they created and all issued documents.
- An `admin` sees all drafts.
- Audit and numbering are not part of the dashboard.
- The workspace is derived from the session; a `companyId` from another workspace is `404`.

---

## 8. UI

```text
Dashboard
┌──────────────────────┬──────────────────────┬──────────────────────┐
│ Outstanding (IDR)    │ Overdue (IDR)        │ Quotations accepted  │
│ Rp 12.500.000        │ Rp 2.500.000 · 3     │ 7 of 20 · 35%        │
└──────────────────────┴──────────────────────┴──────────────────────┘
Recent documents                                    [ View all ]
INV/2026/0007  PT Pelanggan   Partially paid   17 Nov   Rp 974.050
QUO/2026/0042  CV Contoh      Sent             16 Nov   Rp 2.100.000
```

- Cards are clickable and open the filtered list.
- The currency selector appears when more than one currency has activity.
- **Create** is always visible.
- The list header shows the active filters as removable chips.
- The dashboard does not use a chart library in phase 1; a compact status bar is plain HTML/CSS.

---

## 9. Limits

| Limit | Value |
|---|---|
| Page size | 100 |
| Recent documents | 10 |
| Date range | 5 years |
| Search term | 100 characters |
| Currencies per dashboard | All active; typically 1–3 |

---

## 10. Acceptance tests

| # | Test | Expected |
|---|---|---|
| 1 | Two invoices, one partially paid | Outstanding equals the sum of balances |
| 2 | One invoice past due | Overdue card counts it; status becomes `OVERDUE` after the sweep |
| 3 | Two currencies | Two sections; no combined total |
| 4 | Filter by customer and status | Only matching rows; total updates |
| 5 | Search by number fragment | Document returned |
| 6 | Search for `%` | Literal percent matches, not every row |
| 7 | Page through 120 documents | No duplicates, no gaps, stable order |
| 8 | Foreign workspace document id | Not returned; `404` on detail |
| 9 | Viewer | No drafts; no create action |
| 10 | 10,000 documents | List p95 ≤ 300 ms, dashboard ≤ 400 ms |
| 11 | Voided receipt | Outstanding increases by the reversed amount |
| 12 | Dashboard with no data | Cards show 0 with an explanation, not an error |

---

## 11. Related docs

- [`10-PAYMENTS-AND-RECEIPTS.md`](10-PAYMENTS-AND-RECEIPTS.md) — what changes a balance
- [`07-DOCUMENT-LIFECYCLE.md`](07-DOCUMENT-LIFECYCLE.md) — overdue status
- [`0-API.md`](0-API.md) §3.14 — dashboard and list routes
- [`0-DATABASE.md`](0-DATABASE.md) §4 — indexes behind these budgets
