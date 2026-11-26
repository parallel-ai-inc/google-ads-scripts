/**
 * Performance Max Placement Bleed Monitor
 * Read-only Google Ads Script (MIT License)
 * Copyright (c) 2026 Parallel AI, Inc.
 * https://www.withparallel.ai
 * Docs & configurator:
 * https://www.withparallel.ai/scripts/pmax-placement-bleed-monitor
 * Repository:
 * https://github.com/parallel-ai-inc/google-ads-scripts
 *
 * Changes in Google Ads: None (reads via AdsApp.search).
 * Google Ads is a trademark of Google LLC. Parallel AI is
 * not affiliated with or endorsed by Google.
 */

const CONFIG = {
  LOOKBACK_DAYS: "LAST_30_DAYS",
  MIN_IMPRESSIONS: 500,
  FLAG_MOBILE_APPS: true,
  SPREADSHEET_URL: "",
  EMAIL_RECIPIENTS: "",
};

const GAMING_WORDS = [
  "game", "puzzle", "solitaire", "word", "blast", "arcade",
  "casino", "slots", "sudoku", "trivia", "mahjong",
];

const FOREIGN_WORDS = [
  "recetas", "noticias", "nachrichten", "heute", "gratuit", "kostenlos",
];

const FOREIGN_TLDS = [".de", ".es", ".fr", ".ru", ".br", ".mx"];

function main() {
  const query = [
    "SELECT",
    "  campaign.id, campaign.name,",
    "  performance_max_placement_view.placement,",
    "  performance_max_placement_view.display_name,",
    "  performance_max_placement_view.placement_type,",
    "  metrics.impressions",
    "FROM performance_max_placement_view",
    "WHERE segments.date DURING " + CONFIG.LOOKBACK_DAYS,
    "  AND metrics.impressions >= " + CONFIG.MIN_IMPRESSIONS,
    "ORDER BY metrics.impressions DESC",
  ].join("\n");

  const flagged = [];
  const counts = {
    GAMING: 0, MOBILE_APP: 0, FOREIGN_LANGUAGE: 0, CORE: 0,
  };
  let totalImpressions = 0;

  const rows = AdsApp.search(query);
  while (rows.hasNext()) {
    const row = rows.next();
    const view = row.performanceMaxPlacementView || {};
    const placement = String(view.placement || "");
    const name = String(view.displayName || placement);
    const pType = String(view.placementType || "WEBSITE");
    const impr = Number((row.metrics || {}).impressions || 0);
    totalImpressions += impr;

    const grade = gradePlacement(placement, name, pType);
    counts[grade] = (counts[grade] || 0) + impr;
    if (grade !== "CORE") {
      flagged.push([
        row.campaign ? row.campaign.name : "",
        name,
        placement,
        pType,
        grade,
        impr,
      ]);
    }
  }

  const sheet = openOrCreateSheet(
    CONFIG.SPREADSHEET_URL,
    "Parallel AI - PMax Placement Bleed"
  );
  writeTab(sheet, "Flagged placements", [
    "Campaign", "Display name", "Placement",
    "Type", "Grade", "Impressions",
  ], flagged);

  const summaryRows = Object.keys(counts).map((grade) => {
    const impr = counts[grade];
    const share = totalImpressions > 0
      ? ((impr / totalImpressions) * 100).toFixed(1) + "%"
      : "0.0%";
    return [grade, impr, share];
  });
  writeTab(sheet, "Summary", [
    "Grade", "Impressions", "Impression share",
  ], summaryRows);

  if (CONFIG.EMAIL_RECIPIENTS && flagged.length > 0) {
    MailApp.sendEmail(
      CONFIG.EMAIL_RECIPIENTS,
      "PMax placement bleed: " + flagged.length + " flagged",
      "Review impressions-only placement rows in: " + sheet.getUrl()
    );
  }
  Logger.log("Sheet URL: " + sheet.getUrl());
}

function hasWord(text, word) {
  const tokens = text.split(/[^a-z0-9]+/);
  return tokens.indexOf(word) !== -1;
}

function extractHost(raw) {
  let s = String(raw || "").toLowerCase().trim();
  if (s.indexOf("mobileapp::") === 0) return "";
  s = s.replace(/^https?:\/\//, "").split(/[/?#:]/)[0];
  return s;
}

function hasForeignTld(raw) {
  const host = extractHost(raw);
  if (!host) return false;
  return FOREIGN_TLDS.some((tld) => host.endsWith(tld));
}

function gradePlacement(placement, name, pType) {
  const hay = (name + " " + placement).toLowerCase();
  if (pType === "GOOGLE_PRODUCTS" || pType === "YOUTUBE_VIDEO" ||
      pType === "YOUTUBE_CHANNEL") {
    return "CORE";
  }
  if (GAMING_WORDS.some((w) => hasWord(hay, w))) {
    return "GAMING";
  }
  if (FOREIGN_WORDS.some((w) => hasWord(hay, w)) ||
      hasForeignTld(placement) || hasForeignTld(name)) {
    return "FOREIGN_LANGUAGE";
  }
  if (
    CONFIG.FLAG_MOBILE_APPS &&
    (pType === "MOBILE_APPLICATION" ||
      placement.indexOf("mobileapp::") === 0)
  ) {
    return "MOBILE_APP";
  }
  return "CORE";
}

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
