# Free Open-Source Google Ads Scripts (MIT, Read-Only)

Maintained by **[Parallel AI for Google Ads](https://www.withparallel.ai)** — the AI agent platform for Google Ads professionals.

Configure any script in your browser (with live `CONFIG` diffing, URL sharing that strips private Sheet URLs and emails, and interactive Google Sheet previews) at **[withparallel.ai/scripts](https://www.withparallel.ai/scripts)**.

## Scripts

Every script in this repository is **100% read-only on Google Ads**: it reads through `AdsApp.search()` (GAQL v26), writes findings to your Google Sheet via `SpreadsheetApp`, and optionally sends summary alerts from your own account via `MailApp`. Zero bids, budgets, keywords, placements, or campaign statuses are ever modified.

| Script & Interactive Configurator | Source File | GAQL Resources | Runs In |
| --- | --- | --- | --- |
| [Performance Max Placement Bleed Monitor](https://www.withparallel.ai/scripts/pmax-placement-bleed-monitor) | [`scripts/pmax-placement-bleed-monitor.js`](./scripts/pmax-placement-bleed-monitor.js) | `performance_max_placement_view` | Single account |
| [MCC 30.4x Budget Pacing Guardrail](https://www.withparallel.ai/scripts/mcc-budget-pacing-guardrail) | [`scripts/mcc-budget-pacing-30-4x-guardrail.js`](./scripts/mcc-budget-pacing-30-4x-guardrail.js) | `campaign` | Manager (MCC) |
| [Zero-Conversion Search Term Wasted Spend Auditor](https://www.withparallel.ai/scripts/wasted-spend-search-term-auditor) | [`scripts/zero-conversion-search-term-wasted-spend-auditor.js`](./scripts/zero-conversion-search-term-wasted-spend-auditor.js) | `search_term_view`, `ad_group_criterion` | Single account |
| [Shopping Zombie SKU & Cross-Sell Detector](https://www.withparallel.ai/scripts/shopping-zombie-sku-detector) | [`scripts/shopping-zombie-sku-detector.js`](./scripts/shopping-zombie-sku-detector.js) | `shopping_performance_view` | Single account |
| [Landing-Page 404 & Conversion-Drop Watchdog](https://www.withparallel.ai/scripts/conversion-drop-watchdog) | [`scripts/landing-page-404-and-conversion-drop-watchdog.js`](./scripts/landing-page-404-and-conversion-drop-watchdog.js) | `campaign`, `ad_group_ad` | Account or MCC |

## Quick Install

1. Open the interactive configurator on [withparallel.ai/scripts](https://www.withparallel.ai/scripts) or copy a file directly from [`scripts/`](./scripts).
2. In Google Ads, go to **Tools -> Bulk actions -> Scripts** and create a new script.
3. Paste the file, authorize it inside your own Google account, and run **Preview**.
4. Copy the Google Sheet URL from the last log line into `CONFIG.SPREADSHEET_URL` so scheduled runs reuse one Sheet.
5. Set the run frequency (**Daily** or **Weekly**) on the Scripts page.

## Companion Open-Source & Free Resources

- **[Free Browser-Local Google Ads Tools](https://www.withparallel.ai/tools)** — 30.4x Budget Pacing Calculator, Negative Keyword Collision Checker, GA4 vs Google Ads Debugger, Performance Max Waste Estimator, and API v26 GAQL Query Builder.
- **[Free Google Ads Agent Skills](https://www.withparallel.ai/skills)** — 13 open-source skills for Claude Code, Codex, and Cursor (`npx skills add parallel-ai-inc/google-ads-skills -g`).
- **[Parallel AI for Google Ads](https://www.withparallel.ai/blog/google-ads-ai-agent)** — When you want continuous multi-account audits, planning, campaign builds, and editable Docs & Sheets on live Google Ads accounts.

## License & Trademark

Licensed under the [MIT License](./LICENSE). Google Ads is a trademark of Google LLC. Parallel AI is not affiliated with or endorsed by Google.
