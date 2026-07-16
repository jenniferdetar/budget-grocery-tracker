// Combines every source (Kroger official API, Flipp, and your manual overrides) into the
// single data/sales.json file the dashboard reads.

import fs from "node:fs";
import { dedupe, makeItem } from "./lib/normalize.mjs";

function readJsonIfExists(url, fallback) {
  try {
    return JSON.parse(fs.readFileSync(url));
  } catch {
    return fallback;
  }
}

const krogerItems = readJsonIfExists(new URL("../data/kroger-raw.json", import.meta.url), []);
const flippItems = readJsonIfExists(new URL("../data/flipp-raw.json", import.meta.url), []);
const manualRaw = readJsonIfExists(new URL("../data/manual-overrides.json", import.meta.url), {
  items: [],
});

const manualItems = (manualRaw.items || []).map((item) =>
  makeItem({ ...item, source: "manual" })
);

const merged = dedupe([...krogerItems, ...flippItems, ...manualItems]).sort((a, b) => {
  const ad = a.discountPercent ?? -1;
  const bd = b.discountPercent ?? -1;
  return bd - ad;
});

const output = {
  updatedAt: new Date().toISOString(),
  sources: {
    krogerApi: krogerItems.length,
    flipp: flippItems.length,
    manual: manualItems.length,
  },
  items: merged,
};

fs.writeFileSync(new URL("../data/sales.json", import.meta.url), JSON.stringify(output, null, 2));
console.log(
  `[merge] wrote ${merged.length} item(s) to data/sales.json (kroger: ${krogerItems.length}, flipp: ${flippItems.length}, manual: ${manualItems.length})`
);
