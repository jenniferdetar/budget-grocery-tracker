const STORE_COLORS = {
  Ralphs: "var(--store-ralphs)",
  Albertsons: "var(--store-albertsons)",
  Vons: "var(--store-vons)",
  Aldi: "var(--store-aldi)",
  Target: "var(--store-target)",
  CVS: "var(--store-cvs)",
};

const state = {
  items: [],
  activeStores: new Set(),
  search: "",
  sort: "discount-desc",
};

async function init() {
  let data;
  try {
    const res = await fetch("data/sales.json", { cache: "no-store" });
    data = await res.json();
  } catch (err) {
    document.getElementById("updated-at").textContent = "Could not load data/sales.json";
    console.error(err);
    return;
  }

  state.items = data.items || [];
  state.activeStores = new Set(state.items.map((item) => item.store));

  renderUpdatedAt(data.updatedAt);
  renderStats(state.items);
  renderStoreFilters(state.items);
  bindControls();
  render();
}

function renderUpdatedAt(updatedAt) {
  const el = document.getElementById("updated-at");
  if (!updatedAt) {
    el.textContent = "Not yet updated";
    return;
  }
  const date = new Date(updatedAt);
  el.textContent = `Updated ${date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })}`;
}

function renderStats(items) {
  const container = document.getElementById("stats-row");
  const stores = new Set(items.map((i) => i.store));
  const discounts = items.map((i) => i.discountPercent).filter((d) => d != null);
  const bestDiscount = discounts.length ? Math.max(...discounts) : null;
  const now = new Date();
  const expiringSoon = items.filter((i) => {
    if (!i.validTo) return false;
    const daysLeft = (new Date(i.validTo) - now) / (1000 * 60 * 60 * 24);
    return daysLeft >= 0 && daysLeft <= 2;
  }).length;

  const tiles = [
    { label: "Sales tracked", value: items.length },
    { label: "Best discount", value: bestDiscount != null ? `${Math.round(bestDiscount)}%` : "—" },
    { label: "Stores covered", value: stores.size },
    { label: "Expiring in 2 days", value: expiringSoon },
  ];

  container.innerHTML = tiles
    .map(
      (t) => `
      <div class="stat-tile">
        <div class="stat-value">${t.value}</div>
        <div class="stat-label">${t.label}</div>
      </div>`
    )
    .join("");
}

function renderStoreFilters(items) {
  const stores = [...new Set(items.map((i) => i.store))];
  const container = document.getElementById("store-filters");
  container.innerHTML = stores
    .map(
      (store) => `
      <button
        class="store-chip"
        data-store="${store}"
        aria-pressed="true"
        style="border-color: ${STORE_COLORS[store] || "var(--border)"}"
      >
        <span class="dot" style="background: ${STORE_COLORS[store] || "var(--text-muted)"}"></span>
        ${store}
      </button>`
    )
    .join("");

  container.querySelectorAll(".store-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const store = chip.dataset.store;
      const pressed = chip.getAttribute("aria-pressed") === "true";
      chip.setAttribute("aria-pressed", String(!pressed));
      if (pressed) {
        state.activeStores.delete(store);
      } else {
        state.activeStores.add(store);
      }
      render();
    });
  });
}

function bindControls() {
  document.getElementById("search-input").addEventListener("input", (e) => {
    state.search = e.target.value.trim().toLowerCase();
    render();
  });

  document.getElementById("sort-select").addEventListener("change", (e) => {
    state.sort = e.target.value;
    render();
  });
}

function sortItems(items) {
  const sorted = [...items];
  switch (state.sort) {
    case "price-asc":
      return sorted.sort((a, b) => (a.salePrice ?? Infinity) - (b.salePrice ?? Infinity));
    case "expiring-soon":
      return sorted.sort((a, b) => {
        if (!a.validTo) return 1;
        if (!b.validTo) return -1;
        return new Date(a.validTo) - new Date(b.validTo);
      });
    case "name-asc":
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
    case "discount-desc":
    default:
      return sorted.sort((a, b) => (b.discountPercent ?? -1) - (a.discountPercent ?? -1));
  }
}

function formatDateRange(validFrom, validTo) {
  if (!validFrom && !validTo) return "";
  const fmt = (d) => new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (validFrom && validTo) return `Valid ${fmt(validFrom)}–${fmt(validTo)}`;
  if (validTo) return `Through ${fmt(validTo)}`;
  return `From ${fmt(validFrom)}`;
}

const SOURCE_LABELS = {
  "kroger-api": "via Kroger official API",
  flipp: "via Flipp (unofficial)",
  manual: "added manually",
};

function render() {
  const filtered = state.items.filter((item) => {
    if (!state.activeStores.has(item.store)) return false;
    if (state.search && !item.name.toLowerCase().includes(state.search)) return false;
    return true;
  });

  const sorted = sortItems(filtered);
  const grid = document.getElementById("card-grid");
  const emptyState = document.getElementById("empty-state");

  if (sorted.length === 0) {
    grid.innerHTML = "";
    emptyState.hidden = false;
    emptyState.textContent =
      state.items.length === 0
        ? "No sales yet. Run the “Update sales data” GitHub Action (or add items to data/manual-overrides.json) to populate the dashboard."
        : "No items match your filters.";
    return;
  }

  emptyState.hidden = true;
  grid.innerHTML = sorted.map(renderCard).join("");
}

function renderCard(item) {
  const color = STORE_COLORS[item.store] || "var(--text-muted)";
  const discountBadge =
    item.discountPercent != null
      ? `<span class="discount-pill">${Math.round(item.discountPercent)}% off</span>`
      : "";
  const regularPrice =
    item.regularPrice != null
      ? `<span class="regular-price">$${item.regularPrice.toFixed(2)}</span>`
      : "";
  const dateRange = formatDateRange(item.validFrom, item.validTo);

  return `
    <article class="item-card">
      <div class="card-top">
        <span class="store-badge">
          <span class="dot" style="background:${color}"></span>
          ${item.store}
        </span>
        ${discountBadge}
      </div>
      <div class="item-name">${escapeHtml(item.name)}</div>
      ${item.category ? `<div class="item-category">${escapeHtml(item.category)}</div>` : ""}
      <div class="price-row">
        <span class="sale-price">$${item.salePrice.toFixed(2)}</span>
        ${regularPrice}
        ${item.unit ? `<span class="item-unit">${escapeHtml(item.unit)}</span>` : ""}
      </div>
      ${dateRange ? `<div class="valid-dates">${dateRange}</div>` : ""}
      <div class="source-tag">${SOURCE_LABELS[item.source] || item.source}</div>
    </article>`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

init();
