/**
 * Zero-Conversion Search Term Wasted Spend Auditor
 * Read-only Google Ads Script (MIT License)
 * Copyright (c) 2026 Parallel AI, Inc.
 * https://www.withparallel.ai
 * Docs & configurator:
 * https://www.withparallel.ai/scripts/wasted-spend-search-term-auditor
 * Repository:
 * https://github.com/parallel-ai-inc/google-ads-scripts
 *
 * Changes in Google Ads: None (reads via AdsApp.search).
 * Google Ads is a trademark of Google LLC. Parallel AI is
 * not affiliated with or endorsed by Google.
 */

const CONFIG = {
  LOOKBACK_DAYS: "LAST_30_DAYS",
  MIN_COST: 50,
  MIN_CLICKS: 10,
  PROPOSED_MATCH_TYPE: "EXACT",
  SPREADSHEET_URL: "",
  EMAIL_RECIPIENTS: "",
};

function main() {
  const activeKeywords = loadActiveKeywords();
  const query = [
    "SELECT campaign.name, ad_group.name,",
    "  search_term_view.search_term, search_term_view.status,",
    "  metrics.clicks, metrics.cost_micros, metrics.conversions",
    "FROM search_term_view",
    "WHERE segments.date DURING " + CONFIG.LOOKBACK_DAYS,
    "  AND metrics.conversions = 0",
    "ORDER BY metrics.cost_micros DESC",
  ].join("\n");

  const wastedRows = [];
  const editorRows = [];
  const seenEditor = {};
  const criterionType = CONFIG.PROPOSED_MATCH_TYPE === "PHRASE"
    ? "Campaign Negative Phrase"
    : "Campaign Negative Exact";

  const rows = AdsApp.search(query);
  while (rows.hasNext()) {
    const row = rows.next();
    const m = row.metrics || {};
    const clicks = Number(m.clicks || 0);
    const cost = Number(m.costMicros || 0) / 1e6;
    if (clicks < CONFIG.MIN_CLICKS || cost < CONFIG.MIN_COST) continue;

    const st = row.searchTermView || {};
    if (st.status === "EXCLUDED" || st.status === "ADDED_EXCLUDED") {
      continue;
    }
    const campaign = row.campaign ? row.campaign.name : "";
    const adGroup = row.adGroup ? row.adGroup.name : "";
    const term = String(st.searchTerm || "");
    const conflict = blocksActiveKeyword(
      term, CONFIG.PROPOSED_MATCH_TYPE, activeKeywords[campaign] || []
    );

    wastedRows.push([
      campaign,
      adGroup,
      term,
      clicks,
      Math.round(cost * 100) / 100,
      conflict ? "Hold: blocks " + conflict : "Safe for Editor",
    ]);
    const dedupKey = campaign + "\0" + term.toLowerCase();
    if (!conflict && !seenEditor[dedupKey]) {
      seenEditor[dedupKey] = true;
      editorRows.push([campaign, "", term, criterionType]);
    }
  }

  const sheet = openOrCreateSheet(
    CONFIG.SPREADSHEET_URL,
    "Parallel AI - Wasted Spend Auditor"
  );
  writeTab(sheet, "Wasted search terms", [
    "Campaign", "Ad group", "Search term",
    "Clicks", "Cost", "Conflict check",
  ], wastedRows);
  writeTab(sheet, "Editor import", [
    "Campaign", "Ad Group", "Keyword", "Criterion Type",
  ], editorRows);

  if (CONFIG.EMAIL_RECIPIENTS && editorRows.length > 0) {
    MailApp.sendEmail(
      CONFIG.EMAIL_RECIPIENTS,
      "Wasted spend audit: " + editorRows.length + " Editor rows",
      "Review safe negative candidates in: " + sheet.getUrl()
    );
  }
  Logger.log("Sheet URL: " + sheet.getUrl());
}

function loadActiveKeywords() {
  const query = [
    "SELECT campaign.name, ad_group_criterion.keyword.text",
    "FROM ad_group_criterion",
    "WHERE ad_group_criterion.type = 'KEYWORD'",
    "  AND ad_group_criterion.negative = FALSE",
    "  AND ad_group_criterion.status = 'ENABLED'",
  ].join("\n");
  const byCampaign = {};
  const rows = AdsApp.search(query);
  while (rows.hasNext()) {
    const row = rows.next();
    const camp = row.campaign ? row.campaign.name : "";
    const kw = (row.adGroupCriterion || {}).keyword || {};
    if (!kw.text) continue;
    if (!byCampaign[camp]) byCampaign[camp] = [];
    byCampaign[camp].push(tokenize(kw.text));
  }
  return byCampaign;
}

function tokenize(text) {
  return String(text || "").toLowerCase().trim().split(/\s+/)
    .filter(Boolean);
}

function blocksActiveKeyword(negText, matchType, campaignKws) {
  const neg = tokenize(negText);
  for (let i = 0; i < campaignKws.length; i += 1) {
    const kw = campaignKws[i];
    const same = neg.length === kw.length &&
      neg.every((w, idx) => w === kw[idx]);
    if (matchType === "EXACT" && same) return kw.join(" ");
    if (matchType === "PHRASE" && containsPhrase(kw, neg)) {
      return kw.join(" ");
    }
  }
  return null;
}

function containsPhrase(words, phrase) {
  if (phrase.length === 0 || phrase.length > words.length) return false;
  for (let s = 0; s + phrase.length <= words.length; s += 1) {
    let ok = true;
    for (let o = 0; o < phrase.length; o += 1) {
      if (words[s + o] !== phrase[o]) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
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
