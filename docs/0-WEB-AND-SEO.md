# 0 — Web Layer and SEO

> Why Angular renders on the server for public pages, which routes are prerendered, how metadata, structured data,
> sitemap and robots are produced, and how a new public page is added and verified.
> Last updated: November 2026

---

## 1. Why Angular SSR sits in front of the product

The public pages must rank and load fast; the workspace must never be cached or indexed. Angular's SSR gives both
from one codebase:

- Public pages are **prerendered at build time** into real HTML with content, metadata and internal links.
- Generator pages are static marketing content around a client-only editor island; the editor hydrates after
  first paint.
- The authenticated workspace and the print route are **client-rendered**, so no customer data ever appears in
  server HTML or a shared cache.

This is not a second application server. One Angular build produces the browser bundle, the SSR bundle and the
prerendered routes.

---

## 2. Route ownership and render modes

```ts
// apps/web/src/app/app.routes.server.ts (shape)
export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },
  { path: 'invoice-generator', renderMode: RenderMode.Prerender },
  { path: 'quotation-generator', renderMode: RenderMode.Prerender },
  { path: 'sph-generator', renderMode: RenderMode.Prerender },
  { path: 'receipt-generator', renderMode: RenderMode.Prerender },
  { path: 'invoice-templates', renderMode: RenderMode.Prerender },
  { path: 'quotation-templates', renderMode: RenderMode.Prerender },
  { path: 'guides/:slug', renderMode: RenderMode.Prerender, getPrerenderParams: … },
  { path: 'en/**', renderMode: RenderMode.Prerender, getPrerenderParams: … },
  { path: 'login', renderMode: RenderMode.Client },
  { path: 'app/**', renderMode: RenderMode.Client },
  { path: 'print/**', renderMode: RenderMode.Client },
  { path: '**', renderMode: RenderMode.Prerender },
];
```

| Route | Render | Indexed | Cache |
|---|---|---|---|
| `/` | Prerender | Yes | Public, long-lived, hashed assets |
| `/{type}-generator` | Prerender | Yes | Public |
| `/templates`, `/guides/*` | Prerender | Yes | Public |
| `/legal/*` | Prerender | Yes | Public |
| `/en/*` | Prerender | Yes, with hreflang | Public |
| `/login` | Client | No (`noindex`) | `no-store` |
| `/app/**` | Client | No | `private, no-store` |
| `/print/:token` | Client | No | `no-store` |
| `/api/**` | API | No | Per endpoint |

Private routes also send `X-Robots-Tag: noindex, nofollow` and `Cache-Control: private, no-store` from the SSR
server, so a misconfigured page cannot be indexed or cached at the CDN.

---

## 3. Metadata rules

Every public route defines:

| Field | Rule |
|---|---|
| `<title>` | 30–60 characters, unique, ends with “Rumindium Invoice” where it fits |
| Meta description | 120–160 characters, unique, says what the page creates and that it is free |
| Canonical | Absolute URL on `SITE_URL`, no query string, no trailing slash except `/` |
| `h1` | Exactly one, matching the page intent |
| Open Graph | `og:title`, `og:description`, `og:url`, `og:image` (1200 × 630), `og:type` |
| Twitter | `summary_large_image` |
| `lang` | `id` at the root, `en` under `/en` |
| Robots | `index, follow`; `noindex` only on private/utility pages |

Canonical titles:

| Route | Title | Description focus |
|---|---|---|
| `/` | `Rumindium Invoice — Quotation, Invoice & Receipt Generator` | Create professional sales documents free, no account |
| `/invoice-generator` | `Free Invoice Generator — Create & Download PDF Invoices` | Make an invoice with tax, discount and PDF |
| `/quotation-generator` | `Free Quotation Generator — Professional Quotes in Minutes` | Quote goods or services, convert later |
| `/sph-generator` | `Generator SPH — Surat Penawaran Harga Online` | SPH for Indonesian businesses |
| `/receipt-generator` | `Free Receipt / Kwitansi Generator` | Acknowledge a payment with a receipt |
| `/delivery-order-generator` | `Delivery Order Generator — Surat Jalan Online` | P3 only |
| `/surat-jalan-generator` | `Generator Surat Jalan — Delivery Order Online` | P3 only |

Titles and descriptions are asserted in a build test: length bounds, uniqueness, non-empty, and a canonical that
matches the route. A page without metadata fails the build.

---

## 4. Structured data

| Type | Where | Content |
|---|---|---|
| `Organization` | Every page | Name, URL, logo, sameAs (real profiles only) |
| `WebSite` | Home | Name, URL, inLanguage |
| `SoftwareApplication` | Home and generator pages | Name, applicationCategory `BusinessApplication`, operatingSystem `Web`, offers price `0` |
| `BreadcrumbList` | Guides and templates | Visible breadcrumb trail |
| `FAQPage` | A page with visible FAQs | The exact questions and answers on the page |
| `Article` | Guides | Headline, datePublished, dateModified, author (organisation), inLanguage |

Rules:

- Structured data repeats only what a visitor can see. No hidden FAQ, no invented rating, no fake review count.
- JSON-LD is generated from the same page data as the visible content, not typed twice.
- `dateModified` is the real content update date, not the build date.
- Rich results are not guaranteed; the markup is accurate, and the Rich Results test is a check, not a promise.

---

## 5. Sitemap and robots

`apps/web/scripts/generate-seo.ts` builds both from a route manifest at build time.

```text
# public/robots.txt
User-agent: *
Allow: /
Disallow: /app/
Disallow: /print/
Disallow: /api/
Disallow: /auth/
Sitemap: https://invoice.example.com/sitemap.xml
```

```xml
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://invoice.example.com/invoice-generator</loc><lastmod>2026-11-17</lastmod></url>
  …
</urlset>
```

- The sitemap contains only shipped, canonical, indexable routes.
- `lastmod` comes from the page's content file; it is omitted rather than faked.
- `/en` equivalents are included with their own `loc`.
- A route that ships in a later phase is absent; it is not listed with a `noindex` page.
- The sitemap is regenerated on every build and submitted to Search Console after a production deploy.

---

## 6. Language and canonical URLs

| Locale | URL | `hreflang` |
|---|---|---|
| Indonesian (default) | `/invoice-generator` | `id` |
| English | `/en/invoice-generator` | `en` |
| Fallback | `/invoice-generator` | `x-default` |

- The language switch changes the URL, not only the content; a cookie alone would hide the alternate version from
  search engines.
- Each language page has a self-referencing canonical and links to the other language.
- User content (company names, item descriptions) is never translated.
- The document language is chosen in the editor and is independent of the UI language.

---

## 7. Performance

| Measure | Target |
|---|---|
| LCP, p75 mobile | ≤ 2.5 s |
| INP | ≤ 200 ms |
| CLS | ≤ 0.1 |
| TTFB, p95 | ≤ 400 ms |
| Public initial JS | ≤ 220 KB gzip |
| Fonts | Self-hosted, subset, preloaded; no external font CDN |

How:

- Prerender every public route; no API call is needed to paint the page.
- The editor is a lazy route; the public bundle does not import it.
- Critical CSS is inlined by the build; the rest loads without blocking.
- Images have explicit dimensions and `loading="lazy"` below the fold; the social card is static.
- No third-party tag manager, chat widget or analytics script in phase 1. If analytics is added, it loads after
  interaction and never sees form values.

---

## 8. Adding a public page

1. Create the component under `apps/web/src/app/public/`.
2. Add the route to `app.routes.ts` and `app.routes.server.ts` with `RenderMode.Prerender`.
3. Add a metadata entry: title, description, canonical path, `h1`, OG image, language.
4. Write real content: what the document is, who it is for, the fields it needs, a sample, FAQs, and links to
   related guides.
5. Add the route to the sitemap manifest and the internal link graph (header, footer, related pages).
6. Add the title/description to the build test table.
7. Run `npm run build` and verify the emitted HTML contains the title, description, canonical, JSON-LD and `h1`.
8. Run Lighthouse and axe on the built page.

A page that only mounts an editor without explanatory content is not a public page; it is a tool page and still
needs a heading, an explanation and internal links.

---

## 9. Verification checklist

Before a public release:

| # | Check | How |
|---|---|---|
| 1 | Title and description unique and within bounds | `npm run test:seo` |
| 2 | Canonical absolute and self-referencing | Inspect built HTML |
| 3 | Exactly one `h1`, semantic headings | axe + HTML inspection |
| 4 | OG image resolves, 1200 × 630 | `curl -I` the image |
| 5 | JSON-LD parses and matches visible content | Rich Results test |
| 6 | `robots.txt` allows public and blocks private | Fetch `/robots.txt` |
| 7 | Sitemap contains only shipped routes | Fetch `/sitemap.xml` |
| 8 | `/app` and `/print` return `noindex` and `no-store` | `curl -I` |
| 9 | Language alternates resolve | Fetch both URLs |
| 10 | LCP, CLS, INP within budget | Lighthouse CI |
| 11 | No console error on hydration | Playwright smoke |
| 12 | 404 returns a real 404, not a 200 shell | Request an unknown path |

---

## 10. After a production deploy

1. Submit `/sitemap.xml` in Search Console; confirm the property is verified for the real origin.
2. Request indexing for changed URLs only; do not resubmit the whole site on every release.
3. Check the Coverage report for accidental `noindex` or soft 404s.
4. Verify the canonical host (with and without `www`) redirects to one origin.
5. Re-run Lighthouse on the production origin, not only locally.
6. Confirm `/app` and `/print` are absent from the index after a week.

---

## Related docs

- [`0-UI-DESIGN.md`](0-UI-DESIGN.md) — public layout and visual language
- [`12-GUEST-MODE-AND-ACCOUNTS.md`](12-GUEST-MODE-AND-ACCOUNTS.md) — what a guest can do before signing in
- [`0-CONFIG.md`](0-CONFIG.md) — `SITE_URL` and runtime configuration
- [`0-DEV-TO-PRODUCTION.md`](0-DEV-TO-PRODUCTION.md) — release gates
