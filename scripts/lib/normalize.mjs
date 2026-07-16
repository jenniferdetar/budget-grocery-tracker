// Shared helpers used by every scraper + the merge step.

export function round2(n) {
  return Math.round(n * 100) / 100;
}

export function discountPercent(regularPrice, salePrice) {
  if (!regularPrice || !salePrice || regularPrice <= salePrice) return null;
  return round2(((regularPrice - salePrice) / regularPrice) * 100);
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
