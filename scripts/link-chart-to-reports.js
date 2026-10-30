#!/usr/bin/env node
/*
 * Post-process the benchmark-action trend chart so clicking a data point opens
 * that run's archived htmlextra report instead of the GitHub commit page.
 *
 * The generated chart (trend/index.html) contains a Chart.js onClick handler:
 *
 *     const url = dataset[index].commit.url;
 *     window.open(url, '_blank');
 *
 * We rewrite that to prefer a per-run report at reports/<commit.id>.html when
 * such a file exists in the deployed site, and fall back to commit.url
 * otherwise (e.g. historical points archived before this feature existed).
 *
 * Usage:
 *   node scripts/link-chart-to-reports.js <chart-html> <reports-dir>
 *
 * - <chart-html>  path to the chart index.html to rewrite (edited in place)
 * - <reports-dir> directory of archived reports; filenames are <sha>.html
 */
'use strict';

const fs = require('fs');
const path = require('path');

const [, , chartPath, reportsDir] = process.argv;

if (!chartPath || !reportsDir) {
  console.error('Usage: link-chart-to-reports.js <chart-html> <reports-dir>');
  process.exit(2);
}

let html;
try {
  html = fs.readFileSync(chartPath, 'utf8');
} catch (err) {
  console.error(`Cannot read chart HTML at ${chartPath}: ${err.message}`);
  process.exit(2);
}

// Collect the set of commit SHAs that have an archived report.
let shas = [];
try {
  shas = fs
    .readdirSync(reportsDir)
    .filter((f) => f.endsWith('.html'))
    .map((f) => path.basename(f, '.html'));
} catch (_) {
  // No reports dir yet — nothing to link; leave the chart as-is.
  console.log('No reports directory; chart left unchanged.');
  process.exit(0);
}

// The marker string the generated chart uses to open a point's URL. If the
// generator changes this, the replacement safely no-ops (and we log it).
const TARGET = "const url = dataset[index].commit.url;\n                window.open(url, '_blank');";

// Replacement: look up an archived report by commit id; prefer it when present.
// Reports live at ./reports/<sha>.html relative to the chart page at site root.
const REPLACEMENT = [
  "const sha = dataset[index].commit.id;",
  "                const REPORTS = " + JSON.stringify(shas) + ";",
  "                const url = REPORTS.indexOf(sha) !== -1",
  "                  ? ('./reports/' + sha + '.html')",
  "                  : dataset[index].commit.url;",
  "                window.open(url, '_blank');",
].join('\n');

if (html.indexOf(TARGET) === -1) {
  // Try a more tolerant match (whitespace-insensitive around the two lines).
  const re = /const url = dataset\[index\]\.commit\.url;\s*window\.open\(url, '_blank'\);/;
  if (!re.test(html)) {
    console.warn(
      'Chart click handler not found in expected form; leaving chart unchanged. ' +
        'The benchmark-action template may have changed.'
    );
    process.exit(0);
  }
  html = html.replace(re, REPLACEMENT);
} else {
  html = html.split(TARGET).join(REPLACEMENT);
}

fs.writeFileSync(chartPath, html);
console.log(
  `Rewrote chart click handler; ${shas.length} archived report(s) linkable.`
);
