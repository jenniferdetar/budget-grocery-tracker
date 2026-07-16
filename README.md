# Budget Grocery Tracker

A dashboard that tracks weekly grocery sales at local stores near 91335 (Ralphs,
Albertsons, Vons, Aldi, Target, CVS, and Costco) so you can spot the best deals and
stretch your budget further.

## How it works

```
GitHub Actions (daily)          Static site (deployed on Vercel)
┌─────────────────────┐         ┌───────────────────────┐
│ scrape-kroger.mjs    │──┐     │  index.html           │
│  (official Kroger    │  │     │  app.js  ──fetch──►   │
│   API, for Ralphs)    │  ├──► data/sales.json ───────► │  renders cards,
│ scrape-flipp.mjs     │  │     │                       │  filters, stats
│  (Flipp aggregator,   │  │     └───────────────────────┘
│   best-effort)        │  │
│ + data/manual-        │──┘
│   overrides.json      │
│ merge-data.mjs        │
└─────────────────────┘
```

A GitHub Actions workflow runs once a day (and can be run on demand), pulls sale
data from each source, merges it into `data/sales.json`, and commits it. The
dashboard is a plain static site with no backend - Vercel redeploys it automatically
on every push to `main`, and it just fetches `data/sales.json` and renders it client-side.

### Data sources

| Store | Source | Reliability |
|---|---|---|
| Ralphs | [Kroger's official Developer API](https://developer.kroger.com) | High - documented, authenticated, meant for this |
| Albertsons, Vons, Aldi, Target, CVS, Costco | [Flipp](https://flipp.com) flyer aggregator | Best-effort - unofficial/reverse-engineered, may break |
| Any store | `data/manual-overrides.json` | Always works - you type it in |

**Why not "real" scrapers for every store?** None of Albertsons, Aldi, Target,
CVS, or Costco publish an official API for weekly ad data. Building scrapers against their
internal, undocumented endpoints would be fragile (they change without notice)
and would mean going around anti-bot protections, which this project intentionally
avoids. Instead it uses Flipp - a consumer flyer aggregator whose whole purpose is
publishing weekly ads for these chains - as a single best-effort source, and falls
back gracefully (see below) when that doesn't work.

**Note on Costco:** Costco doesn't run traditional weekly-ad flyers (it's
membership-based and mostly relies on its monthly coupon book), so Flipp may not
have much - or anything - listed for it. `data/manual-overrides.json` is likely
the more realistic way to track Costco deals.

**Graceful degradation:** every scraper is wrapped so a broken/blocked source never
fails the whole pipeline - it just contributes zero items that day, and the daily
log (Actions tab) tells you why. `data/manual-overrides.json` always works, so the
dashboard is never fully empty as long as you're keeping it updated.

## One-time setup

1. **Deployment.** This repo is connected to Vercel, which redeploys the static
   site automatically on every push to `main` - no build step needed, it just
   serves `index.html`/`app.js`/`style.css`/`data/`.
2. **(Optional, recommended) Get a free Kroger API key** for the most reliable
   Ralphs data:
   - Register an app at [developer.kroger.com/manage/apps/register](https://developer.kroger.com/manage/apps/register)
     (Public API product is free).
   - Add its Client ID/Secret as GitHub repo secrets: Settings → Secrets and
     variables → Actions → New repository secret → `KROGER_CLIENT_ID` and
     `KROGER_CLIENT_SECRET`.
   - Without this, the dashboard still works - it just relies on Flipp + manual
     entries for Ralphs too.
3. **Run the workflow once manually** to populate real data instead of the example
   item: GitHub Actions tab → "Update sales data" → Run workflow. Once it commits
   `data/sales.json`, Vercel redeploys automatically within a minute.

After that, it runs automatically once a day.

## Adding sales by hand

Automated sources will miss things (in-store-only markdowns, a coupon you found,
a store Flipp doesn't cover well). Edit `data/manual-overrides.json`:

```json
{
  "items": [
    {
      "store": "Ralphs",
      "chain": "Kroger",
      "name": "Chicken thighs",
      "category": "meat",
      "regularPrice": 4.99,
      "salePrice": 2.99,
      "unit": "1 lb",
      "validFrom": "2026-07-16",
      "validTo": "2026-07-22",
      "notes": "Saw this in-store, not on Ralphs' digital ad"
    }
  ]
}
```

Commit the change (or let the next scheduled run pick it up - manual entries are
always merged in alongside the automated sources).

### Cost per ounce

Every item shows a `$/oz` figure when its size can be parsed - either from a
dedicated size field (Kroger always provides one, e.g. `"16 OZ"`, `"2 LB"`, `"2
liter"`) or, failing that, from weight/volume mentioned in the product name
(common for Flipp results, e.g. `"...6 MegaRolls"`). Fluid ounces are treated as
equivalent to weight ounces for comparison purposes - a standard simplification,
not a strict conversion. Items with no parseable size (most count-based products,
like "12 CT") just don't show one. Sort by "Lowest cost per ounce first" to
compare package sizes directly. For manual entries, write the `unit` field as a
plain number + unit (`"1 lb"`, `"16 oz"`, `"2 liter"`) rather than something like
`"each"` or `"per lb"` if you want it to compute.

## Customizing

- **Location/stores/search terms:** edit `data/config.json` (zip code, store
  banners, and the list of grocery categories each scraper searches for).
- **Schedule:** edit the cron expression in `.github/workflows/update-sales.yml`.

## Limitations & disclaimers

- This is a **personal-use tool**. It fetches public, freely-viewable weekly-ad
  data at low frequency (once a day) and does not attempt to defeat rate limiting
  or bot detection. It is not intended for commercial use or redistribution of the
  underlying data.
- The Flipp integration (`scripts/scrape-flipp.mjs`) is **unofficial** - if Flipp
  changes their site, it may return zero results until the field-mapping in that
  file is updated. Check the Actions log for warnings.
- **Always verify price and availability in-store or in the retailer's own app**
  before making purchasing decisions - none of these sources are guaranteed
  accurate or current.

## License

MIT - see [LICENSE](LICENSE).
