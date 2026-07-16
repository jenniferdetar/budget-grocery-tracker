// Best-effort adapter for Flipp (flipp.com), a flyer aggregator that republishes weekly
// grocery ad data (including Ralphs, Albertsons, Vons, Aldi and Target) searchable by zip
// code. This is NOT an official/documented API - it's the endpoint Flipp's own site and
// apps use to render flyers, reverse-engineered by various hobby projects.
//
// Because it's unofficial, its shape can change without notice. Every request is wrapped
// in try/catch: a broken or renamed field never fails the whole run, it just yields fewer
// items for that one category/store, and logs enough detail (via FLIPP_DEBUG=1) to help
// you fix the field-mapping below if Flipp changes something.
//
// Be a good citizen: this script runs once a day (see the workflow), makes a small,
// fixed number of requests, and does not attempt to defeat rate limiting or bot detection.
// If Flipp starts blocking these requests, just disable this script (or drop the offending
// store from data/config.json) and rely on the Kroger API + manual overrides instead.

import fs from "node:fs";
import { fetchWithRetry, makeItem, sleep } from "./lib/normalize.mjs";

const config = JSON.parse(fs.readFileSync(new URL("../data/config.json", import.meta.url)));
const OUT_PATH = new URL("../data/flipp-raw.json", import.meta.url);
const DEBUG = process.env.FLIPP_DEBUG === "1";

const HEADERS = {
  Accept: "application/json",
  "User-Agent":
    "Mozilla/5.0 (compatible; budget-grocery-tracker/1.0; personal-use grocery sale dashboard)",
};

function extractItems(payload) {
  // Flipp's response shape has varied across reverse-engineering write-ups; try the
  // known candidates rather than assuming one fixed structure.
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data?.items)) return payload.data.items;
  return [];
}

function pick(obj, keys) {
  for (const key of keys) {
    if (obj?.[key] != null) return obj[key];
  }
  return null;
}

function matchesStore(rawItem, hint) {
  const merchant = pick(rawItem, ["merchant", "retailer_name", "retailer"]);
  const merchantName =
    typeof merchant === "string" ? merchant : pick(merchant || {}, ["name"]);
  if (!merchantName) return false;
  return merchantName.toLowerCase().includes(hint.toLowerCase());
}

function toItem(rawItem, store, chain, term) {
  const name = pick(rawItem, ["name", "title", "description"]);
  const salePrice = pick(rawItem, ["price", "current_price", "sale_price"]);
  if (!name || salePrice == null) return null;
  const regularPrice = pick(rawItem, ["original_price", "was_price", "regular_price"]);
  const validFrom = pick(rawItem, ["valid_from", "start_date"]);
  const validTo = pick(rawItem, ["valid_to", "end_date"]);
  const imageUrl = pick(rawItem, ["image_url", "image"]);
  const sourceUrl = pick(rawItem, ["flyer_url", "url"]);

  return makeItem({
    store,
    chain,
    name,
    category: term,
    regularPrice: regularPrice != null ? Number(regularPrice) : null,
    salePrice: Number(salePrice),
    validFrom,
    validTo,
    imageUrl,
    source: "flipp",
    sourceUrl: sourceUrl || "https://flipp.com",
  });
}

async function searchTerm(term) {
  const url = `https://backflipp.wishabi.com/flipp/items/search?postal_code=${encodeURIComponent(
    config.zip
  )}&q=${encodeURIComponent(term)}&locale=en-us`;
  const res = await fetchWithRetry(url, { headers: HEADERS });
  const payload = await res.json();
  if (DEBUG) {
    console.log(`[flipp] sample payload for "${term}":`, JSON.stringify(payload).slice(0, 500));
  }
  return extractItems(payload);
}

async function main() {
  const allItems = [];

  for (const term of config.categories) {
    try {
      const rawItems = await searchTerm(term);
      for (const store of config.stores) {
        const matched = rawItems.filter((raw) => matchesStore(raw, store.flippRetailerHint));
        for (const raw of matched) {
          const item = toItem(raw, store.banner, store.chain, term);
          if (item) allItems.push(item);
        }
      }
      console.log(`[flipp] "${term}": ${rawItems.length} raw result(s) fetched`);
    } catch (err) {
      console.warn(`[flipp] failed to fetch term "${term}": ${err.message}`);
    }
    await sleep(500); // one request at a time, politely spaced out
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(allItems, null, 2));
  console.log(`[flipp] wrote ${allItems.length} item(s) to data/flipp-raw.json`);
}

main().catch((err) => {
  console.error("[flipp] fatal error, writing empty result so the pipeline can continue:", err);
  fs.writeFileSync(OUT_PATH, JSON.stringify([], null, 2));
  process.exitCode = 0; // Flipp is a best-effort source; never fail the whole workflow over it
});
