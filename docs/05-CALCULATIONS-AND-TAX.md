# 05 — Calculations and Tax

> Decimal money, line and document discounts, tax-inclusive and tax-exclusive pricing, rounding, allocation,
> invariants and amount in words. This is the only place the arithmetic is defined.
> Feature ID `F05` · queue: `client + domain` · phase `P1`
> Last updated: November 2026

---

## 1. Overview

All money arithmetic lives in `packages/domain` and runs in two places: the browser for the live preview and the
API for the authoritative stored values. It is the same code, the same inputs and the same version.

```text
line gross → line discount → document discount allocation → tax → line net/tax/total
           → subtotal → charges → grand total → amount in words
```

No JavaScript `number` is authoritative for money. The domain uses `decimal.js` with precision 34 and
`ROUND_HALF_UP`. The database stores `numeric(19,4)`; the API serialises decimals as strings.

---

## 2. Representation

| Value | Type | Precision | Example |
|---|---|---|---|
| Money | `Decimal(19,4)` | 4 decimals | `"974050.0000"` |
| Quantity | `Decimal(18,4)` | 4 decimals | `"2.5000"` |
| Percentage | `Decimal(7,4)` | 0–100, 4 decimals | `"11.0000"` |
| Currency | ISO 4217 | 3 letters | `"IDR"` |
| Minor units | integer map | IDR 0, USD/EUR/SGD 2, JPY 0 | see §8 |

`decimal.js` configuration:

```ts
Decimal.set({ precision: 34, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -9, toExpPos: 21 });
```

A value arriving from JSON is parsed with `new Decimal(string)`, never `new Decimal(number)`.

---

## 3. Calculation sequence

### 3.1 Line gross

```text
gross = quantity × unitPrice
```

Computed at full precision, not rounded yet.

### 3.2 Line discount

| Type | Formula |
|---|---|
| `NONE` | `lineDiscount = 0` |
| `PERCENT` | `lineDiscount = gross × discountRate / 100` |
| `AMOUNT` | `lineDiscount = discountAmount`; must be ≤ gross, a larger amount is rejected |

```text
netAfterLine = gross − lineDiscount
```

### 3.3 Document discount

```text
documentDiscount = PERCENT ? Σ netAfterLine × rate / 100
                           : amount   (must be ≤ Σ netAfterLine)
```

The discount is allocated across lines in proportion to `netAfterLine`, at 4 decimal places, using the
largest-remainder method so the allocations sum exactly to `documentDiscount`. No line may receive more than its
`netAfterLine`.

```text
lineBase = netAfterLine − allocation
```

### 3.4 Tax

| Mode | Tax | Net excluding tax | Line total |
|---|---|---|---|
| `EXCLUSIVE` | `lineBase × rate / 100` | `lineBase` | `lineBase + tax` |
| `INCLUSIVE` | `lineBase × rate / (100 + rate)` | `lineBase − tax` | `lineBase` |

The rate is per line. A document may mix 0%, 11% and another rate; the PDF groups tax by rate.

### 3.5 Rounding

1. Round each line's `tax` to the currency's minor units with `HALF_UP`.
2. Round each line's `netExTax` to minor units with `HALF_UP`.
3. Set `lineTotal = netExTaxRounded + taxRounded`. In inclusive mode this can differ from the unrounded gross by
   one minor unit; the stored line total is the rounded sum, and the PDF prints it.
4. `subtotal = Σ netExTaxRounded`.
5. `taxTotal = Σ taxRounded`.

### 3.6 Charges

Charges are entered **excluding tax**, whatever the line tax mode is.

```text
chargesBase = shippingAmount + additionalCharges
chargesTax  = chargesTaxRate ? chargesBase × chargesTaxRate / 100 : 0
chargesTax  = round(chargesTax, minorUnits)
```

There is no inclusive extraction for charges; the editor labels the fields "excl. tax".

### 3.7 Grand total

```text
grandTotal = subtotal + taxTotal + shippingAmount + additionalCharges + chargesTax
```

All components are already at minor-unit precision, so the sum is exact and is stored with four decimals.

### 3.8 Discount total (informational)

```text
discountTotal = Σ lineDiscount + documentDiscount
```

It is not subtracted again; the discounts are already inside `subtotal`.

---

## 4. Worked examples

### 4.1 Exclusive tax, line and document discount

| Step | Value |
|---|---|
| Quantity × price | 2 × 500,000 = 1,000,000 |
| Line discount 10% | 100,000 |
| Net after line discount | 900,000 |
| Document discount 5% | 45,000 |
| Line base | 855,000 |
| Tax 11% exclusive | 94,050 |
| Line total | 949,050 |
| Subtotal | 855,000 |
| Tax total | 94,050 |
| Shipping (untaxed) | 25,000 |
| **Grand total** | **974,050** |
| Discount total (info) | 145,000 |

`855,000 + 94,050 + 25,000 = 974,050`.

### 4.2 Inclusive tax

| Step | Value |
|---|---|
| Quantity × price | 1 × 1,110,000 |
| Line base | 1,110,000 |
| Tax 11% included | 1,110,000 × 11 / 111 = 110,000 |
| Net excluding tax | 1,000,000 |
| Line total | 1,110,000 |
| Subtotal | 1,000,000 |
| Tax total | 110,000 |
| **Grand total** | **1,110,000** |

`1,000,000 + 110,000 = 1,110,000`.

### 4.3 Document discount allocation

Two lines, net 600,000 and 400,000; document discount 100,000. Allocations are 60,000 and 40,000, each line's
base becomes 540,000 and 360,000. The allocations sum exactly.

Three equal lines of 333,333.3333 with a 100,000 discount: allocations are 33,333.3334, 33,333.3333 and
33,333.3333, chosen by largest remainder, and sum to 100,000.

### 4.4 Rupiah rounding

3 × 333.3333 = 999.9999; 11% tax = 109.999989 → **110** at 0 minor units. Net rounds to **1,000**. Line total
**1,110**. Subtotal 1,000, tax 110, grand 1,110.

---

## 5. Invariants

Every calculated document must satisfy, at minor-unit precision:

```text
grandTotal = subtotal + taxTotal + shippingAmount + additionalCharges + chargesTax
subtotal   = Σ lineSubtotal
taxTotal   = Σ lineTax
lineTotal  = lineSubtotal + lineTax
lineSubtotal ≥ 0
lineTax ≥ 0
0 ≤ lineDiscount ≤ lineGross
0 ≤ documentDiscount ≤ Σ netAfterLine
Σ allocations = documentDiscount
balanceDue = grandTotal − amountPaid   (0 ≤ balanceDue ≤ grandTotal)
```

The API recalculates and compares the client's values before saving a draft or issuing. A difference of one minor
unit is rejected with `422 TOTAL_MISMATCH`; the response includes the server's values.

---

## 6. Tax modes in practice

| Situation | Mode | Effect |
|---|---|---|
| Prices quoted before tax (common B2B) | `EXCLUSIVE` | Tax is added at the bottom |
| Consumer price already includes tax | `INCLUSIVE` | Tax is extracted and shown, total unchanged |
| Mixed tax rates | Either | Each line keeps its own rate; totals group by rate |
| No tax registration | Either, rates 0 | Tax total is 0; the line is still valid |

The document stores `taxMode`; a line does not have its own mode. Changing the mode on a draft recalculates every
line and is recorded in the audit event when the document is issued.

Tax rates are data, not constants. The product does not assume a country's current rate, and it does not advise
which rate applies. A company sets its default; a user may override a line.

---

## 7. Amount in words

- Generated in the document language (`id-ID` or `en-US`).
- IDR: `"sembilan ratus tujuh puluh empat ribu lima puluh rupiah"`.
- USD: `"one thousand two hundred fifty dollars and 00/100"`; cents are read as minor units.
- Zero: `"nol rupiah"` / `"zero dollars"`.
- Negative values (credit notes): prefix `"minus"`.
- Supported range: 0 to 999,999,999,999.9999; outside it, the field is omitted and a warning is logged.
- The string is frozen in `calculationSnapshot` at issue; a later language-pack change does not alter an old PDF.

---

## 8. Currency minor units

| Currency | Minor units | Display example |
|---|---|---|
| `IDR` | 0 | `Rp 974.050` |
| `USD` | 2 | `$974.05` |
| `EUR` | 2 | `€974.05` |
| `SGD` | 2 | `S$974.05` |
| `JPY` | 0 | `¥974,050` |

Currency symbols and grouping come from `Intl.NumberFormat`. The stored value never depends on the display locale.
There is no FX conversion; a document has one currency, and dashboard totals are grouped by currency.

---

## 9. Engine version and change control

- The engine exports `ENGINE_VERSION`; it is written into every calculation snapshot.
- A change to a formula, rounding step or allocation is a new engine version, with a migration note and new test
  vectors.
- Old documents are never recalculated with a new engine. The snapshot keeps the old result and version.
- A bug that produced a wrong stored total is corrected by a void/reissue or an adjustment, not by silently
  rewriting the document.

---

## 10. Acceptance tests

| # | Test | Expected |
|---|---|---|
| 1 | Example 4.1 end to end | Exact values in §4.1 |
| 2 | Example 4.2 inclusive | Exact values in §4.2 |
| 3 | Document discount on three equal lines | Allocations sum exactly to the discount |
| 4 | Fixed discount above the net total | `DOCUMENT_VALIDATION_FAILED` |
| 5 | Quantity 0 or negative | Rejected |
| 6 | Unit price negative | Rejected |
| 7 | Tax rate 100% | Valid; tax equals the base (exclusive) |
| 8 | Mixed 0%, 11%, 12% lines | Tax grouped by rate; total exact |
| 9 | IDR tax rounding | Whole rupiah, HALF_UP |
| 10 | USD tax rounding | Cents, HALF_UP |
| 11 | Client sends a total off by 0.0001 | `422 TOTAL_MISMATCH` |
| 12 | Amount in words, IDR and USD | Matches the frozen snapshot |
| 13 | 200 lines | Under 16 ms |
| 14 | Old snapshot with engine 1.0 | Rendered unchanged after engine 1.1 ships |

---

## 11. Related docs

- [`0-DOCUMENT-MODEL.md`](0-DOCUMENT-MODEL.md) §5–§6 — snapshots and stored fields
- [`04-DOCUMENT-EDITOR.md`](04-DOCUMENT-EDITOR.md) — where the numbers are entered
- [`08-PDF-AND-PRINT.md`](08-PDF-AND-PRINT.md) — how totals are printed
- [`13-CREDIT-DEBIT-NOTES-AND-SOA.md`](13-CREDIT-DEBIT-NOTES-AND-SOA.md) — negative amounts and balances
- [`0-TESTING.md`](0-TESTING.md) §7 — the financial vectors
