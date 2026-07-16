// Pulls real sale data for Ralphs (a Kroger banner) using Kroger's OFFICIAL public
// Developer API: https://developer.kroger.com
//
// This requires a free API key. Without one, this script skips itself (exit 0) and
// the dashboard just relies on the Flipp adapter + manual overrides instead.
//
// Setup: create an app at https://developer.kroger.com/manage/apps/register,
// then add KROGER_CLIENT_ID and KROGER_CLIENT_SECRET as repo secrets
// (Settings -> Secrets and variables -> Actions).

import fs from "node:fs";
import { fetchWithRetry, makeItem, sleep } from "./lib/normalize.mjs";

const config = JSON.parse(fs.readFileSync(new URL("../data/config.json", import.meta.url)));
const OUT_PATH = new URL("../data/kroger-raw.json", import.meta.url);

const CLIENT_ID = process.env.KROGER_CLIENT_ID;
const CLIENT_SECRET = process.env.KROGER_CLIENT_SECRET;

async function getToken() {
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
  const res = await fetchWithRetry("https://api.kroger.com/v1/connect/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials&scope=product.compact",
  });
  const data = await res.json();
  return data.access_token;
}

async function findLocationId(token, zip) {
  const url = `https://api.kroger.com/v1/locations?filter.zipCode.near=${zip}&filter.radiusInMiles=15&filter.limit=10&filter.chain=Ralphs`;
  const res = await fetchWithRetry(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  const locations = data.data || [];
  if (locations.length === 0) {
    throw new Error(`No Ralphs locations found near zip ${zip}`);
  }
  return locations[0].locationId;
}

async function searchTerm(token, locationId, term) {
  const url = `https://api.kroger.com/v1/products?filter.locationId=${locationId}&filter.term=${encodeURIComponent(term)}&filter.limit=10`;
  const res = await fetchWithRetry(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  return data.data || [];
}

function toItems(products, term) {
  const items = [];
  for (const product of products) {
    const priceInfo = product.items?.[0]?.price;
    if (!priceInfo) continue;
    const regular = priceInfo.regular;
    const promo = priceInfo.promo;
    // Only surface it as a "sale" when there's an actual promo price below regular.
    if (!promo || !regular || promo >= regular) continue;
    items.push(
      makeItem({
        store: "Ralphs",
        chain: "Kroger",
        name: product.description,
        category: term,
        regularPrice: regular,
        salePrice: promo,
        unit: product.items?.[0]?.size || null,
        imageUrl: product.images?.[0]?.sizes?.[0]?.url || null,
        source: "kroger-api",
        sourceUrl: "https://www.ralphs.com",
      })
    );
  }
  return items;
}

async function main() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.log("[kroger] KROGER_CLIENT_ID/KROGER_CLIENT_SECRET not set - skipping official API source.");
    fs.writeFileSync(OUT_PATH, JSON.stringify([], null, 2));
    return;
  }

  console.log("[kroger] fetching OAuth token...");
  const token = await getToken();

  console.log(`[kroger] locating nearest Ralphs to zip ${config.zip}...`);
  const locationId = await findLocationId(token, config.zip);
  console.log(`[kroger] using locationId ${locationId}`);

  const allItems = [];
  for (const term of config.categories) {
    try {
      const products = await searchTerm(token, locationId, term);
      const items = toItems(products, term);
      console.log(`[kroger] "${term}": ${items.length} on-sale item(s)`);
      allItems.push(...items);
    } catch (err) {
      console.warn(`[kroger] failed to fetch term "${term}": ${err.message}`);
    }
    await sleep(300); // be polite, don't hammer the API
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(allItems, null, 2));
  console.log(`[kroger] wrote ${allItems.length} item(s) to data/kroger-raw.json`);
}

main().catch((err) => {
  console.error("[kroger] fatal error, writing empty result so the pipeline can continue:", err);
  fs.writeFileSync(OUT_PATH, JSON.stringify([], null, 2));
  process.exitCode = 0; // never fail the whole workflow because Kroger's API had a hiccup
});
