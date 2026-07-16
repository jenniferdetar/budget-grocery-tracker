// Shared helpers used by every scraper + the merge step.

export function round2(n) {
  return Math.round(n * 100) / 100;
}

export function discountPercent(regularPrice, salePrice) {
  if (!regularPrice || !salePrice || regularPrice <= salePrice) return null;
  return round2(((regularPrice - salePrice) / regularPrice) * 100);
}

// Extracts a weight/volume from a size string (e.g. Kroger's "16 OZ", "2 LB") or, as a
// fallback, from free text like a Flipp product name ("...6 MegaRolls 330 2Ply"). Fluid
// ounces are treated as equivalent to weight ounces - a standard simplification for
// unit-price comparisons. Metric units are only trusted from a dedicated size field
// (allowMetric), since bare "g"/"kg" tokens are too likely to be false positives in
// arbitrary product name text.
export function parseOunces(text, { allowMetric = false } = {}) {
  if (!text) return null;
  const t = text.toLowerCase();
  let m;
  if ((m = t.match(/(\d+(?:\.\d+)?)\s*(?:fl\.?\s*oz|fluid\s*ounces?)\b/))) return Number(m[1]);
  if ((m = t.match(/(\d+(?:\.\d+)?)\s*(?:oz|ounces?)\b/))) return Number(m[1]);
  if ((m = t.match(/(\d+(?:\.\d+)?)\s*(?:lbs?|pounds?)\b/))) return Number(m[1]) * 16;
  if ((m = t.match(/(\d+(?:\.\d+)?)\s*(?:qt|quarts?)\b/))) return Number(m[1]) * 32;
  if ((m = t.match(/(\d+(?:\.\d+)?)\s*(?:gal|gallons?)\b/))) return Number(m[1]) * 128;
  if ((m = t.match(/(\d+(?:\.\d+)?)\s*(?:pt|pints?)\b/))) return Number(m[1]) * 16;
  if (allowMetric) {
    if ((m = t.match(/(\d+(?:\.\d+)?)\s*(?:kg|kilograms?)\b/))) return Number(m[1]) * 35.274;
    if ((m = t.match(/(\d+(?:\.\d+)?)\s*(?:g|grams?)\b/))) return Number(m[1]) * 0.035274;
    if ((m = t.match(/(\d+(?:\.\d+)?)\s*(?:ml|milliliters?)\b/))) return Number(m[1]) * 0.033814;
    if ((m = t.match(/(\d+(?:\.\d+)?)\s*(?:l|liters?)\b/))) return Number(m[1]) * 33.814;
  }
  return null;
}

// $/oz, so items of very different package sizes can be compared on a level footing.
// Tries the dedicated size/unit field first, then falls back to parsing the product name.
export function costPerOunce(salePrice, unit, name) {
  if (salePrice == null) return null;
  const ounces = parseOunces(unit, { allowMetric: true }) ?? parseOunces(name, { allowMetric: false });
  if (!ounces || ounces <= 0) return null;
  return Math.round((salePrice / ounces) * 1000) / 1000;
}

// Builds one item in the common schema every source (Kroger API, Flipp, manual) is normalized into.
export function makeItem({
  store,
  chain,
  name,
  category = null,
  regularPrice = null,
  salePrice,
  unit = null,
  validFrom = null,
  validTo = null,
  imageUrl = null,
  source,
  sourceUrl = null,
  notes = null,
}) {
  return {
    store,
    chain,
    name,
    category,
    regularPrice: regularPrice != null ? round2(regularPrice) : null,
    salePrice: salePrice != null ? round2(salePrice) : null,
    discountPercent: discountPercent(regularPrice, salePrice),
    unit,
    validFrom,
    validTo,
    imageUrl,
    source,
    sourceUrl,
    notes,
  };
}

// Best-effort dedupe: same store + near-identical name + same sale price.
export function dedupe(items) {
  const seen = new Map();
  for (const item of items) {
    const key = `${item.store}|${(item.name || "").trim().toLowerCase()}|${item.salePrice}`;
    if (!seen.has(key)) seen.set(key, item);
  }
  return [...seen.values()];
}

export async function fetchWithRetry(url, options = {}, { retries = 2, delayMs = 500 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await sleep(delayMs * (attempt + 1));
    }
  }
  throw lastErr;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
