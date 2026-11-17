# 0 — UI Design

> Design principles, page layouts, the document editor, action hierarchy, keyboard model, visual language,
> accessibility, internationalisation and UI performance budgets.
> Last updated: November 2026

---

## 1. Design principles

1. **The document is the interface.** The editor looks like the paper it produces; the preview is never a surprise.
2. **Plain language.** "Send quotation", "Record payment", "Void invoice" — not accounting jargon.
3. **One primary action per screen.** Save draft, issue, or record payment; everything else is secondary.
4. **Show the number before it is committed.** Totals and tax are visible while editing; the server value replaces
   the preview on save without a jump.
5. **Destructive actions are deliberate.** Void requires a reason; deleting a draft is confirmed; issued documents
   cannot be deleted.
6. **Status is text, not colour alone.** Every badge carries a label and an icon.
7. **Guest mode is honest.** The UI says where data lives and what clearing the browser does.
8. **Fast by default.** The editor does not wait for the network to recalculate a line.

---

## 2. Public pages

```text
┌────────────────────────────────────────────────────────────────────┐
│ Logo   Invoice  Quotation  Receipt  Templates  Guides     Sign in  │
├────────────────────────────────────────────────────────────────────┤
│  H1  Create a professional invoice in minutes                      │
│  One sentence of value. No account required.                       │
│  [ Create an invoice ]   [ See a sample ]                          │
│                                                                    │
│  ┌──────────────────────────────┐  ┌───────────────────────────┐   │
│  │  document preview thumbnail  │  │ 1. Add your details       │   │
│  │  (real render, not a mock)   │  │ 2. Add line items         │   │
│  └──────────────────────────────┘  │ 3. Print or save PDF      │   │
│                                    └───────────────────────────┘   │
├────────────────────────────────────────────────────────────────────┤
│  How it works · Templates · Guides · FAQ · Footer (legal, privacy) │
└────────────────────────────────────────────────────────────────────┘
```

- The generator is reachable in one click from the header and the hero; no sign-up wall.
- Public pages contain real explanatory content (what the document is, when to use it, what fields it needs), not
  an empty app shell.
- The sample is a real rendered document with fictional data, clearly labelled.
- No fake testimonials, customer logos or usage counts.

Generator pages (`/invoice-generator`, `/quotation-generator`, `/sph-generator`, `/receipt-generator`) use the same
shell: title, short explanation, the editor, a "what is included" section, three to five FAQs, and links to related
guides. Delivery-order pages ship in P3, when the document exists.

---

## 3. Workspace shell

```text
┌──────────────┬─────────────────────────────────────────────────────┐
│ Company ▾    │  Search documents…          [+ Create ▾]   Account  │
│              ├─────────────────────────────────────────────────────┤
│ Dashboard    │                                                     │
│ Documents    │  Page content                                       │
│  Quotations  │                                                     │
│  Orders      │                                                     │
│  Deliveries  │                                                     │
│  Invoices    │                                                     │
│  Receipts    │                                                     │
│ Customers    │                                                     │
│ Products     │                                                     │
│ Companies    │                                                     │
│ Templates    │                                                     │
│ Settings     │                                                     │
└──────────────┴─────────────────────────────────────────────────────┘
```

- The company switcher is always visible; changing it reloads scoped data and is remembered per user.
- `+ Create` opens a type menu; only shipped types appear.
- The sidebar collapses to icons below 1100 px and becomes a drawer below 760 px.
- The account menu holds profile, workspace, sign out, theme (light only in phase 1), and help.
- Unimplemented menu items are absent, not disabled placeholders.

---

## 4. Document editor

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ ← Invoices   Draft · doc_01J…              [Save draft]  [Preview] [Issue]│
├───────────────────────────┬──────────────────────────────┬─────────────────┤
│ DOCUMENT                  │ LINE ITEMS                   │ PREVIEW         │
│ Type        Invoice       │ ┌──────────────────────────┐ │  A4 paper       │
│ Number      Draft         │ │ Item   Qty  Price  Total │ │  zoom  fit/100% │
│ Issue date  2026-11-17    │ │ …                        │ │                 │
│ Due date    2026-12-01    │ └──────────────────────────┘ │  live totals    │
│ Currency    IDR ▾         │ [+ Add line] [Import item]   │                 │
│                           │                              │                 │
│ CUSTOMER                  │ DISCOUNT & CHARGES           │                 │
│ [Select customer]         │ Discount …  Shipping …       │                 │
│                           │                              │                 │
│ NOTES & TERMS             │ TOTALS                       │                 │
│ …                         │ Subtotal / Tax / Total       │                 │
└───────────────────────────┴──────────────────────────────┴─────────────────┘
```

| Area | Behaviour |
|---|---|
| Header | Back, type and status, save state, Preview, Issue. Issue is primary and disabled until valid |
| Document panel | Dates, currency, reference, customer, one-time customer, template |
| Line items | Editable table; drag handle plus **Move up/down** buttons; add from catalog or a custom line |
| Discount and charges | One document discount, shipping, additional charges, optional charges tax |
| Totals | Sticky; updates on every valid change; shows tax breakdown by rate |
| Preview | Sticky on desktop; a tab on tablet; a full-screen sheet on mobile |

Responsive rules:

- ≥ 1280 px: three columns (320 / flexible / 420).
- 960–1279 px: two columns; preview becomes a toggle drawer.
- 760–959 px: single column; preview is a tab; totals stick above the action bar.
- < 760 px: single column; the action bar is fixed at the bottom with Save and Issue.

The preview is the same component as the print route, scaled. It is never a hand-built HTML approximation.

---

## 5. Interaction model and action hierarchy

| Level | Treatment | Examples |
|---|---|---|
| Primary | Filled brand button, one per screen | Issue invoice, Record payment, Save company |
| Secondary | Outline button | Save draft, Preview, Add line |
| Tertiary | Text or icon | Duplicate, Download PDF, Print |
| Destructive | Danger outline, confirmation with reason | Void invoice, Void receipt, Delete draft |

Rules:

- **Save draft** and **Issue** are visually distinct and never adjacent without a gap. The issue button says what it
  does: "Issue invoice", not "Submit".
- The issue review sheet lists number, customer, total, due date and template, with one confirmation.
- **Void** opens a dialog requiring a reason (10–500 characters) and explains the effect on payments and balances.
- **Record payment** shows the outstanding balance, prefills it, and blocks an amount above it.
- A form with errors scrolls to the first invalid field and shows an error summary at the top.
- Loading uses skeletons with the final layout, not a centred spinner that replaces the page.
- Empty states explain the next action and link to it; they are never blank.
- Offline guest editing shows a non-blocking banner: "Saved on this device. Not uploaded."

---

## 6. Keyboard model

| Action | Shortcut | Scope |
|---|---|---|
| Save draft | `Mod+S` | Editor |
| Preview | `Mod+Shift+P` | Editor |
| Add line | `Mod+Enter` | Line table, when the last row is focused |
| Delete focused line | `Delete` with confirmation | Line table |
| Move line up/down | `Alt+↑` / `Alt+↓` | Line table |
| Close dialog | `Esc` | Global |
| Focus search | `/` | Workspace |
| Next/previous field | `Tab` / `Shift+Tab` | Global |

`Mod+Enter` never issues a document. Issuing requires an explicit click and a review, because it allocates a
permanent number. Shortcuts are documented in the help menu and do not fire while typing in a text field unless
they use `Mod`.

---

## 7. Visual language

| Token | Value | Use |
|---|---|---|
| `--ri-color-ink` | `#16181D` | Primary text |
| `--ri-color-muted` | `#5B6472` | Secondary text, labels |
| `--ri-color-line` | `#E3E6EB` | Borders, dividers |
| `--ri-color-surface` | `#FFFFFF` | Cards, paper |
| `--ri-color-canvas` | `#F6F7F9` | App background |
| `--ri-color-brand` | `#1F5F5B` | Primary actions, links |
| `--ri-color-brand-strong` | `#174A47` | Hover, active |
| `--ri-color-accent` | `#D97706` | Highlights, sample badges |
| `--ri-color-success` | `#1E7A46` | Paid, accepted, delivered |
| `--ri-color-warning` | `#B45309` | Due soon, partial |
| `--ri-color-danger` | `#B42318` | Overdue, void, errors |
| `--ri-color-info` | `#1D4ED8` | Informational notes |

| Token | Value |
|---|---|
| Spacing | `4, 8, 12, 16, 24, 32, 48, 64 px` |
| Radius | `6 px` controls, `10 px` cards, `16 px` sheets, `999 px` pills |
| Shadow | `0 1px 2px rgb(16 24 40 / 6%)`, `0 8px 24px rgb(16 24 40 / 8%)` |
| UI font | Inter, self-hosted, weights 400/500/600 |
| Document font | Source Serif 4 for the document title, Inter for the table |
| Numeric | `font-variant-numeric: tabular-nums` for money and quantities |
| Type scale | `12, 13, 14, 16, 20, 24, 32, 40 px`; line height 1.4–1.6 |
| Borders | 1 px `--ri-color-line`; no heavy outlines |

Status badges use a colour plus a label and a small icon: `Draft`, `Sent`, `Accepted`, `Issued`, `Partially paid`,
`Paid`, `Overdue`, `Void`. Colour is never the only signal.

The document layout uses the company accent for thin rules and the title underline, not for body text. The paper
is white; the app canvas is grey so the page edge is visible.

---

## 8. Document design

| Element | Rule |
|---|---|
| Paper | A4 210 × 297 mm, 18 mm top/bottom, 16 mm sides; Letter optional |
| Header | Logo left/centre/right, issuer block, document title and number |
| Parties | Issuer and customer side by side; shipping address below when it differs |
| Meta | Issue date, due date or valid until, reference, currency |
| Table | Item, description, quantity, unit, unit price, discount, tax, line total |
| Totals | Subtotal, discount, tax (by rate), shipping, additional charges, grand total |
| Amount in words | Below the total, in the document language |
| Footer | Terms, bank details, signature area, page x of y |
| Page breaks | Table header repeats; rows avoid splitting; totals block stays together |
| Long content | Descriptions wrap; a 2,000-character description may span pages |
| Empty fields | Omit the row entirely; never print "null" or a blank label |

The printed document never shows internal notes, cost prices, draft watermarks on issued copies, or the app's
navigation.

---

## 9. States

| State | Treatment |
|---|---|
| Loading | Skeleton matching the final layout; no layout shift |
| Empty list | One sentence, an illustration-free icon, and the primary action |
| Error | Inline message, retry, and a request id the user can quote |
| Validation | Field message, error summary, focus on the first invalid field |
| Saving | Button label changes to "Saving…"; the editor stays editable unless the save is issuing |
| Save conflict | Dialog: *Reload server version* or *Keep my draft*; the choice is explicit |
| Offline (guest) | Banner that data is local; no error modal |
| Offline (account) | Banner that changes are not saved; retry when the connection returns |
| PDF pending | "Preparing PDF…" with a retry after 30 seconds; issuing is not blocked |
| Permission denied | Explain the role required; never show a raw 403 page |

---

## 10. Accessibility

- WCAG 2.2 AA: contrast 4.5:1 for text, 3:1 for large text and UI boundaries.
- Every control has a programmatic label; placeholders are not labels.
- Focus is visible (2 px brand ring, 2 px offset) and never trapped outside a dialog.
- A dialog traps focus, closes on `Esc`, and returns focus to the trigger.
- The line-item table has a caption and column headers; totals are announced through `aria-live="polite"` after a
  change, debounced so screen readers are not flooded.
- Error summary links to each field; `aria-invalid` and `aria-describedby` are set.
- Touch targets are at least 44 × 44 px.
- Motion respects `prefers-reduced-motion`; no animation is required to understand a state.
- The document PDF uses real headings, table headers and reading order; it is not claimed to be a tagged PDF unless
  verified.

---

## 11. Internationalisation

| Aspect | Rule |
|---|---|
| UI languages | `id-ID` (default) and `en-US` |
| Framework | `@angular/localize`, ICU messages, XLIFF files |
| Document language | Chosen per document, independent of the UI language |
| Numbers and dates | `Intl.NumberFormat` and `Intl.DateTimeFormat` with the active locale |
| Currency | ISO code stored; symbol and decimals from the locale and currency table |
| Amount in words | Generated in the document language by `packages/domain` |
| Labels | Quotation/SPH label is a company setting, not a translation key |
| User content | Never translated, never machine-translated |
| Layout | Indonesian labels are often longer; buttons wrap without clipping |

The UI language is stored on the user profile and can be switched without changing document data.

---

## 12. Performance budgets

| Interaction | Target |
|---|---|
| Public page LCP (p75, mobile) | ≤ 2.5 s |
| Public page INP | ≤ 200 ms |
| Public page CLS | ≤ 0.1 |
| Editor route initial JS | ≤ 350 KB gzip |
| Public initial JS | ≤ 220 KB gzip |
| Recalculate 200 lines | ≤ 16 ms |
| Typing in a line field | No frame drop; preview update debounced 150 ms |
| Open preview drawer | ≤ 150 ms |
| Scroll a 200-line preview | 60 fps on the reference laptop |
| Save draft round trip | ≤ 350 ms p95 |

The editor route is lazy-loaded; the public shell does not import editor code. Fonts are self-hosted and subset;
no external font request blocks first paint.

---

## Related docs

- [`0-WEB-AND-SEO.md`](0-WEB-AND-SEO.md) — public pages, metadata and render modes
- [`04-DOCUMENT-EDITOR.md`](04-DOCUMENT-EDITOR.md) — editor behaviour and validation
- [`08-PDF-AND-PRINT.md`](08-PDF-AND-PRINT.md) — the printed document
- [`14-DOCUMENT-TEMPLATES.md`](14-DOCUMENT-TEMPLATES.md) — layout variants
- [`12-GUEST-MODE-AND-ACCOUNTS.md`](12-GUEST-MODE-AND-ACCOUNTS.md) — guest and account states
