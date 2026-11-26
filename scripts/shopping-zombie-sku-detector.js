/**
 * Shopping Zombie SKU & Cross-Sell Detector
 * Read-only Google Ads Script (MIT License)
 * Copyright (c) 2026 Parallel AI, Inc.
 * https://www.withparallel.ai
 * Docs & configurator:
 * https://www.withparallel.ai/scripts/shopping-zombie-sku-detector
 * Repository:
 * https://github.com/parallel-ai-inc/google-ads-scripts
 *
 * Changes in Google Ads: None (reads via AdsApp.search).
 * Google Ads is a trademark of Google LLC. Parallel AI is
 * not affiliated with or endorsed by Google.
 */

const CONFIG = {
  LOOKBACK_DAYS: "LAST_30_DAYS",
  ZOMBIE_MAX_IMPRESSIONS: 50,
  BLEEDER_MIN_COST: 75,
  INCLUDE_CART_CROSS_SELL: true,
  SPREADSHEET_URL: "",
  EMAIL_RECIPIENTS: "",
};

function main() {
  const selectFields = [
    "campaign.name",
    "segments.product_item_id",
    "segments.product_title",
    "segments.product_brand",
    "metrics.impressions",
    "metrics.clicks",
    "metrics.cost_micros",
    "metrics.conversions",
    "metrics.conversions_value",
  ];
  if (CONFIG.INCLUDE_CART_CROSS_SELL) {
    selectFields.push("metrics.all_cross_sell_units_sold");
    selectFields.push("metrics.all_cross_sell_revenue_micros");
  }

  const query = [
    "SELECT " + selectFields.join(", "),
    "FROM shopping_performance_view",
    "WHERE segments.date DURING " + CONFIG.LOOKBACK_DAYS,
    "ORDER BY metrics.cost_micros DESC",
  ].join("\n");

  const bySku = {};
  const rows = AdsApp.search(query);
  while (rows.hasNext()) {
    const row = rows.next();
    const seg = row.segments || {};
    const m = row.metrics || {};
    const sku = String(seg.productItemId || "");
    if (!sku) continue;
    if (!bySku[sku]) {
      bySku[sku] = {
        sku,
        title: String(seg.productTitle || ""),
        brand: String(seg.productBrand || ""),
        impr: 0, clicks: 0, cost: 0, conv: 0, value: 0,
        crossUnits: 0, crossRev: 0,
      };
    }
    const acc = bySku[sku];
    acc.impr += Number(m.impressions || 0);
    acc.clicks += Number(m.clicks || 0);
    acc.cost += Number(m.costMicros || 0) / 1e6;
    acc.conv += Number(m.conversions || 0);
    acc.value += Number(m.conversionsValue || 0);
    acc.crossUnits += Number(m.allCrossSellUnitsSold || 0);
    acc.crossRev += Number(m.allCrossSellRevenueMicros || 0) / 1e6;
  }

  const zombies = [];
  const bleeders = [];
  const crossSell = [];
  Object.keys(bySku).forEach((sku) => {
    const s = bySku[sku];
    if (s.impr <= CONFIG.ZOMBIE_MAX_IMPRESSIONS) {
      zombies.push([
        s.sku, s.title, s.brand, s.impr, s.clicks, round2(s.cost),
      ]);
    }
    if (s.conv === 0 && s.cost >= CONFIG.BLEEDER_MIN_COST) {
      bleeders.push([
        s.sku, s.title, s.brand, s.clicks, round2(s.cost), s.conv,
      ]);
    }
    if (CONFIG.INCLUDE_CART_CROSS_SELL && s.crossRev > 0) {
      crossSell.push([
        s.sku, s.title, round2(s.cost), round2(s.value),
        round1(s.crossUnits), round2(s.crossRev),
      ]);
    }
  });

  const sheet = openOrCreateSheet(
    CONFIG.SPREADSHEET_URL,
    "Parallel AI - Shopping Zombie SKUs"
  );
  writeTab(sheet, "Zombie SKUs", [
    "Item ID", "Product title", "Brand",
    "Impressions", "Clicks", "Cost",
  ], zombies);
  writeTab(sheet, "Zero-conv spenders", [
    "Item ID", "Product title", "Brand",
    "Clicks", "Cost", "Conversions",
  ], bleeders);
  if (CONFIG.INCLUDE_CART_CROSS_SELL) {
    writeTab(sheet, "Cross-sell cart", [
      "Item ID", "Product title", "Cost",
      "Direct value", "Cross-sell units", "Cross-sell rev",
    ], crossSell);
  }

  if (CONFIG.EMAIL_RECIPIENTS &&
      (zombies.length > 0 || bleeders.length > 0)) {
    MailApp.sendEmail(
      CONFIG.EMAIL_RECIPIENTS,
      "Shopping SKU check: " + zombies.length + " zombies, " +
        bleeders.length + " non-converters",
      "Review segmented SKU tabs in: " + sheet.getUrl()
    );
  }
  Logger.log("Sheet URL: " + sheet.getUrl());
}

function round2(n) { return Math.round(n * 100) / 100; }
function round1(n) { return Math.round(n * 10) / 10; }

function safeCell(val) {
  if (typeof val !== "string") return val;
  if (/^[=+@]/.test(val) || /^-[^0-9.]/.test(val)) return "'" + val;
  return val;
}

function openOrCreateSheet(url, fallbackName) {
  return url
    ? SpreadsheetApp.openByUrl(url)
    : SpreadsheetApp.create(fallbackName);
}

function writeTab(spreadsheet, name, headers, rows) {
  let tab = spreadsheet.getSheetByName(name);
  if (!tab) tab = spreadsheet.insertSheet(name);
  tab.clearContents();
  const safeRows = rows.map((r) => r.map(safeCell));
  const data = [headers].concat(safeRows);
  tab.getRange(1, 1, data.length, headers.length).setValues(data);
}
