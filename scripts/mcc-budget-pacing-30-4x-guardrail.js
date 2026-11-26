/**
 * MCC 30.4x Budget Pacing Guardrail
 * Read-only Google Ads Script (MIT License)
 * Copyright (c) 2026 Parallel AI, Inc.
 * https://www.withparallel.ai
 * Docs & configurator:
 * https://www.withparallel.ai/scripts/mcc-budget-pacing-guardrail
 * Repository:
 * https://github.com/parallel-ai-inc/google-ads-scripts
 *
 * Changes in Google Ads: None (reads via AdsApp.search).
 * Google Ads is a trademark of Google LLC. Parallel AI is
 * not affiliated with or endorsed by Google.
 */

const CONFIG = {
  OVERPACE_ALERT_PCT: 15,
  UNDERPACE_ALERT_PCT: 20,
  INCLUDE_PAUSED_CAMPAIGNS: true,
  SPREADSHEET_URL: "",
  EMAIL_RECIPIENTS: "",
};

const MONTH_MULTIPLE = 30.4;
const DAY_MULTIPLE = 2;

function main() {
  const pacingRows = [];
  const alertRows = [];

  const accounts = AdsManagerApp.accounts().get();
  while (accounts.hasNext()) {
    const account = accounts.next();
    AdsManagerApp.select(account);
    const stats = summarizeAccount();
    if (stats.dailyBudget <= 0 && stats.mtdSpend <= 0) continue;

    const row = [
      account.getCustomerId(),
      account.getName(),
      round2(stats.dailyBudget),
      round2(stats.dailyBudget * DAY_MULTIPLE),
      round2(stats.dailyBudget * MONTH_MULTIPLE),
      round2(stats.mtdSpend),
      round2(stats.evenSpend),
      round1(stats.variancePct) + "%",
      stats.status,
    ];
    pacingRows.push(row);
    if (stats.status !== "ON_PACE") alertRows.push(row);
  }

  const sheet = openOrCreateSheet(
    CONFIG.SPREADSHEET_URL,
    "Parallel AI - MCC 30.4x Budget Pacing"
  );
  const headers = [
    "Account ID", "Account", "Daily budget",
    "2x daily limit", "30.4x month limit", "MTD spend",
    "Even pace", "Variance", "Status",
  ];
  writeTab(sheet, "Account pacing", headers, pacingRows);
  writeTab(sheet, "Alerts", headers, alertRows);

  if (CONFIG.EMAIL_RECIPIENTS && alertRows.length > 0) {
    MailApp.sendEmail(
      CONFIG.EMAIL_RECIPIENTS,
      "MCC pacing alerts: " + alertRows.length + " accounts",
      "Review 30.4x pacing table in: " + sheet.getUrl()
    );
  }
  Logger.log("Sheet URL: " + sheet.getUrl());
}

function summarizeAccount() {
  const tz = AdsApp.currentAccount().getTimeZone();
  const dayOfMonth = Math.max(1, Number(
    Utilities.formatDate(new Date(), tz, "d")
  ));
  const statusFilter = CONFIG.INCLUDE_PAUSED_CAMPAIGNS
    ? "campaign.status != 'REMOVED'"
    : "campaign.status = 'ENABLED'";
  const query = [
    "SELECT campaign.id, campaign.status,",
    "  campaign_budget.resource_name,",
    "  campaign_budget.amount_micros,",
    "  campaign_budget.explicitly_shared,",
    "  metrics.cost_micros",
    "FROM campaign",
    "WHERE segments.date DURING THIS_MONTH",
    "  AND " + statusFilter,
  ].join("\n");

  const seenBudgets = {};
  let dailyBudget = 0;
  let mtdSpend = 0;
  const rows = AdsApp.search(query);
  while (rows.hasNext()) {
    const row = rows.next();
    const metrics = row.metrics || {};
    mtdSpend += Number(metrics.costMicros || 0) / 1e6;
    const c = row.campaign || {};
    const b = row.campaignBudget || {};
    const key = b.resourceName || c.id;
    if (c.status === "ENABLED" && !seenBudgets[key]) {
      seenBudgets[key] = true;
      dailyBudget += Number(b.amountMicros || 0) / 1e6;
    }
  }

  const evenSpend = dailyBudget * dayOfMonth;
  const variancePct = evenSpend > 0
    ? ((mtdSpend - evenSpend) / evenSpend) * 100
    : 0;
  let status = "ON_PACE";
  if (variancePct >= CONFIG.OVERPACE_ALERT_PCT) {
    status = "OVERPACING";
  } else if (variancePct <= -CONFIG.UNDERPACE_ALERT_PCT) {
    status = "UNDERPACING";
  }
  return { dailyBudget, mtdSpend, evenSpend, variancePct, status };
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
