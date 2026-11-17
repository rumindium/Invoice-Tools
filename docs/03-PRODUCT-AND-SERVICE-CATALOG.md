# 03 — Product and Service Catalog

> Reusable products and services with a unit, default price, tax treatment and description, plus custom lines for
> one-off work.
> Feature ID `F03` · queue: `api` · phase `P2`
> Last updated: November 2026

---

## 1. Overview

The catalog is a convenience, not an inventory system. It stores what a line usually looks like so a user can add
it in one click. Prices are copied into the document line at the moment it is added; a later catalog price change
never rewrites a document, draft or issued.

Custom lines remain first-class: a plumber can bill "emergency call-out" without creating a catalog item.

---

## 2. Fields

| Field | Required | Notes |
|---|---|---|
| Kind | Yes | `PRODUCT` or `SERVICE`; filter only |
| Name | Yes | 1–200 characters |
| SKU / code | No | Unique per workspace when present; ≤ 60 characters |
| Description | No | Default line description, ≤ 2,000 characters |
| Unit | Yes | `pcs`, `unit`, `hour`, `day`, `kg`, `lot`, `m`, `m²`, `session`, or a custom unit ≤ 20 characters |
| Unit price | Yes | ≥ 0, 4 decimals |
| Tax rate | No | 0–100; null uses the company default |
| Active | Yes | Inactive items are hidden from the picker but stay in old documents |
| Archived | — | Set by archive; hidden from pickers and search by default |

---

## 3. Behaviour

### 3.1 Add to a document

- The editor's item picker searches by name and SKU, filters by kind, and shows unit and price.
- Selecting an item adds a line with name, description, unit, price and tax. The user may then change any of
  these on the line; the document does not stay linked for pricing.
- The line keeps `catalogItemId` for reporting, but the printed values come from the line, not the catalog.
- Adding the same item twice creates two lines; there is no quantity merge by default.

### 3.2 Price history

- Updating `unitPrice` affects future lines only. No document is recalculated.
- The API never joins a line to the catalog to fetch a price; the line stores its own price.
- Renaming an item does not rename past lines.
- Archiving an item does not remove it from a draft or an issued document.

### 3.3 Custom lines

- A custom line has `catalogItemId = null` and every value entered by the user.
- It can be saved to the catalog after the document is saved, with the same "Save to catalog" action as a
  one-time customer.
- Deleting a custom line has no catalog effect.

### 3.4 Duplicate SKU

`POST` and `PATCH` reject a duplicate SKU within the workspace with `409 DUPLICATE_SKU`. A missing SKU is allowed
for any number of items. Archived items do not reserve a SKU.

### 3.5 Import and export

CSV import is not in phase 1. The API list can be exported by the client later; no separate export endpoint ships
before a real request.

---

## 4. UI

| Screen | Content |
|---|---|
| Catalog list | Search, kind filter, archived toggle; name, SKU, unit, price, tax; **New item** |
| Item form | Name, kind, SKU, description, unit, price, tax, active; **Save** |
| Item picker | Inline in the editor: search, recent items, unit and price; **Create new** |
| Item detail | Usage count and the last five documents that used it |

The list shows prices in the company currency and formats them with the locale. A currency change in the company
does not convert existing catalog prices; it changes the display currency for new documents.

---

## 5. Limits

| Limit | Value |
|---|---|
| Items per workspace | 5,000 |
| Name | 200 characters |
| SKU | 60 characters |
| Description | 2,000 characters |
| Custom unit | 20 characters |
| Unit price | 999,999,999,999.9999 |
| Tax rate | 0–100, 4 decimals |

---

## 6. Acceptance tests

| # | Test | Expected |
|---|---|---|
| 1 | Create an item and add it to an invoice | Line copies name, description, unit, price and tax |
| 2 | Change the item price after issuing | Issued invoice unchanged; a new line uses the new price |
| 3 | Archive an item | Hidden from the picker; old documents still render |
| 4 | Duplicate SKU in one workspace | `409 DUPLICATE_SKU` |
| 5 | Same SKU in two workspaces | Both allowed |
| 6 | Custom line with no catalog item | Saved; `catalogItemId` null |
| 7 | Search by partial SKU | Item returned |
| 8 | Tax rate null | Company default applied when the line is created |
| 9 | Delete a catalog item referenced by a draft | Archive only; draft still opens |
| 10 | 5,001st item | `422 DOCUMENT_LIMIT_EXCEEDED` with a clear message |

---

## 7. Related docs

- [`04-DOCUMENT-EDITOR.md`](04-DOCUMENT-EDITOR.md) — line items and the picker
- [`05-CALCULATIONS-AND-TAX.md`](05-CALCULATIONS-AND-TAX.md) — how tax and discounts apply to a line
- [`0-API.md`](0-API.md) §3.6 — catalog routes
- [`0-DATABASE.md`](0-DATABASE.md) §3.6 — `catalog_items`
