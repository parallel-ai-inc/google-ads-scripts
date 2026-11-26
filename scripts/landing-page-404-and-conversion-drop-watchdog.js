/**
 * Landing-Page 404 & Conversion-Drop Watchdog
 * Read-only Google Ads Script (MIT License)
 * Copyright (c) 2026 Parallel AI, Inc.
 * https://www.withparallel.ai
 * Docs & configurator:
 * https://www.withparallel.ai/scripts/conversion-drop-watchdog
 * Repository:
 * https://github.com/parallel-ai-inc/google-ads-scripts
 *
 * Changes in Google Ads: None (reads via AdsApp.search).
 * Google Ads is a trademark of Google LLC. Parallel AI is
 * not affiliated with or endorsed by Google.
 */

const CONFIG = {
  WINDOW_DAYS: 7,
  LAG_SKIP_DAYS: 2,
  CONVERSION_DROP_ALERT_PCT: 35,
  MIN_BASELINE_CONVERSIONS: 10,
  CHECK_FINAL_URLS: true,
  MAX_URLS_PER_RUN: 200,
  SPREADSHEET_URL: "",
  EMAIL_RECIPIENTS: "",
};

function main() {
  const dropRows = [];
  const brokenRows = [];
  const urlState = { checked: 0, seen: {} };

  if (typeof AdsManagerApp !== "undefined") {
    const accounts = AdsManagerApp.accounts().get();
    while (accounts.hasNext()) {
      const account = accounts.next();
      AdsManagerApp.select(account);
      auditCurrentAccount(
        account.getName(), dropRows, brokenRows, urlState
      );
    }
  } else {
    const name = AdsApp.currentAccount().getName();
    auditCurrentAccount(name, dropRows, brokenRows, urlState);
  }

  const sheet = openOrCreateSheet(
    CONFIG.SPREADSHEET_URL,
    "Parallel AI - Conversion Drop & 404 Watchdog"
  );
  writeTab(sheet, "Conversion drops", [
    "Account", "Campaign", "Prior conv",
    "Recent conv", "Change", "Recent CPA",
  ], dropRows);
  if (CONFIG.CHECK_FINAL_URLS) {
    writeTab(sheet, "Broken URLs", [
      "Account", "Campaign", "Ad group", "Final URL", "HTTP status",
    ], brokenRows);
  }

  const totalAlerts = dropRows.length + brokenRows.length;
  if (CONFIG.EMAIL_RECIPIENTS && totalAlerts > 0) {
    MailApp.sendEmail(
      CONFIG.EMAIL_RECIPIENTS,
      "Watchdog alert: " + dropRows.length + " drops, " +
        brokenRows.length + " broken URLs",
      "Review watchdog sheet in: " + sheet.getUrl()
    );
  }
  Logger.log("Sheet URL: " + sheet.getUrl());
}

function auditCurrentAccount(
  accountName, dropRows, brokenRows, urlState
) {
  const tz = AdsApp.currentAccount().getTimeZone();
  const ranges = buildLagSafeRanges(
    CONFIG.WINDOW_DAYS, CONFIG.LAG_SKIP_DAYS, tz
  );
  const prior = readCampaignConversions(ranges.priorStart, ranges.priorEnd);
  const recent = readCampaignConversions(
    ranges.recentStart, ranges.recentEnd
  );

  Object.keys(prior).forEach((id) => {
    const base = prior[id];
    if (base.conv < CONFIG.MIN_BASELINE_CONVERSIONS) return;
    const cur = recent[id] || { name: base.name, conv: 0, cost: 0 };
    const dropPct = ((base.conv - cur.conv) / base.conv) * 100;
    if (dropPct >= CONFIG.CONVERSION_DROP_ALERT_PCT) {
      const cpa = cur.conv > 0 ? round2(cur.cost / cur.conv) : "n/a";
      dropRows.push([
        accountName,
        base.name,
        round1(base.conv),
        round1(cur.conv),
        "-" + round1(dropPct) + "%",
        cpa,
      ]);
    }
  });

  if (CONFIG.CHECK_FINAL_URLS) {
    checkActiveFinalUrls(accountName, brokenRows, urlState);
  }
}

function readCampaignConversions(startDate, endDate) {
  const query = [
    "SELECT campaign.id, campaign.name,",
    "  metrics.conversions, metrics.cost_micros",
    "FROM campaign",
    "WHERE segments.date BETWEEN '" + startDate + "' AND '" +
      endDate + "'",
    "  AND campaign.status = 'ENABLED'",
  ].join("\n");
  const map = {};
  const rows = AdsApp.search(query);
  while (rows.hasNext()) {
    const row = rows.next();
    const c = row.campaign || {};
    const m = row.metrics || {};
    if (!map[c.id]) map[c.id] = { name: c.name, conv: 0, cost: 0 };
    map[c.id].conv += Number(m.conversions || 0);
    map[c.id].cost += Number(m.costMicros || 0) / 1e6;
  }
  return map;
}

function checkActiveFinalUrls(accountName, brokenRows, urlState) {
  const query = [
    "SELECT campaign.name, ad_group.name, ad_group_ad.ad.final_urls",
    "FROM ad_group_ad",
    "WHERE campaign.status = 'ENABLED'",
    "  AND ad_group.status = 'ENABLED'",
    "  AND ad_group_ad.status = 'ENABLED'",
    "  AND segments.date DURING LAST_7_DAYS",
    "  AND metrics.clicks > 0",
  ].join("\n");
  const rows = AdsApp.search(query);
  while (rows.hasNext() && urlState.checked < CONFIG.MAX_URLS_PER_RUN) {
    const row = rows.next();
    const urls = (((row.adGroupAd || {}).ad || {}).finalUrls) || [];
    for (let i = 0; i < urls.length; i += 1) {
      const url = String(urls[i] || "");
      if (!url || urlState.seen[url]) continue;
      if (urlState.checked >= CONFIG.MAX_URLS_PER_RUN) break;
      urlState.seen[url] = true;
      urlState.checked += 1;
      const code = fetchHttpStatus(url);
      if (code >= 400 || code === 0) {
        brokenRows.push([
          accountName,
          row.campaign ? row.campaign.name : "",
          row.adGroup ? row.adGroup.name : "",
          url,
          code === 0 ? "Network error" : String(code),
        ]);
      }
    }
  }
}

function fetchHttpStatus(url) {
  try {
    const res = UrlFetchApp.fetch(url, {
      method: "get", muteHttpExceptions: true, followRedirects: true,
    });
    return res.getResponseCode();
  } catch (err) {
    return 0;
  }
}

function buildLagSafeRanges(windowDays, lagSkipDays, timeZone) {
  const today = new Date();
  const shift = (daysAgo) => {
    const d = new Date(today.getTime() - daysAgo * 86400000);
    return Utilities.formatDate(d, timeZone, "yyyy-MM-dd");
  };
  const recentEndOffset = 1 + lagSkipDays;
  const recentStartOffset = recentEndOffset + windowDays - 1;
  const priorEndOffset = recentStartOffset + 1;
  const priorStartOffset = priorEndOffset + windowDays - 1;
  return {
    recentStart: shift(recentStartOffset),
    recentEnd: shift(recentEndOffset),
    priorStart: shift(priorStartOffset),
    priorEnd: shift(priorEndOffset),
  };
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
