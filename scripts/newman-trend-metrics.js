#!/usr/bin/env node
/*
 * Reads a Newman JSON report and emits two things:
 *   1. A GitHub Actions job-summary table (to $GITHUB_STEP_SUMMARY), so each
 *      run is readable at a glance on the run page.
 *   2. A benchmark-action-compatible metrics file (customSmallerIsBetter), so
 *      benchmark-action/github-action-benchmark can chart the values over time
 *      on the gh-pages branch.
 *
 * Usage:
 *   node scripts/newman-trend-metrics.js <results.json> <metrics-out.json>
 *
 * "Smaller is better" is the correct direction for every metric here: we want
 * failed assertions and response time to trend DOWN. Passed-assertion count is
 * expressed as "failed" so the single chart direction stays consistent.
 */
'use strict';

const fs = require('fs');

const [, , resultsPath, metricsOutPath] = process.argv;

if (!resultsPath || !metricsOutPath) {
  console.error('Usage: newman-trend-metrics.js <results.json> <metrics-out.json>');
  process.exit(2);
}

let report;
try {
  report = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
} catch (err) {
  console.error(`Could not read Newman report at ${resultsPath}: ${err.message}`);
  process.exit(2);
}

const run = report.run || {};
const stats = run.stats || {};
const timings = run.timings || {};

const assertions = stats.assertions || { total: 0, failed: 0 };
const requests = stats.requests || { total: 0, failed: 0 };
const assertionsPassed = assertions.total - assertions.failed;
const responseAverage = Math.round(timings.responseAverage || 0);

// 1. Job summary (Markdown). Only write if the env var is present (i.e. in CI).
const summaryFile = process.env.GITHUB_STEP_SUMMARY;
if (summaryFile) {
  const passRate = assertions.total
    ? ((assertionsPassed / assertions.total) * 100).toFixed(1)
    : '0.0';
  // The verdict must reflect ALL Newman failures, not just failed assertions.
  // A request error, or a test script throwing outside a pm.test (e.g. a 200
  // response whose invalid body makes pm.response.json() throw), is recorded as
  // a failed request and/or a run.failures entry while assertions.failed stays
  // 0. Deriving the verdict from assertions alone would mislabel such a run as a
  // pass.
  const runFailures = Array.isArray(run.failures) ? run.failures.length : 0;
  const hasFailure = assertions.failed > 0 || requests.failed > 0 || runFailures > 0;
  const verdict = hasFailure ? '❌ fail' : '✅ pass';
  const summary = [
    '### PokéAPI collection results',
    '',
    '| Metric | Value |',
    '| --- | --- |',
    `| Result | ${verdict} |`,
    `| Assertions passed | ${assertionsPassed} / ${assertions.total} (${passRate}%) |`,
    `| Assertions failed | ${assertions.failed} |`,
    `| Requests failed | ${requests.failed} / ${requests.total} |`,
  ];
  // Surface run-level failures so a fail with zero failed assertions is explained.
  if (runFailures > 0) {
    summary.push(`| Script/other failures | ${runFailures} |`);
  }
  summary.push(`| Avg response time | ${responseAverage} ms |`, '');
  const summaryText = summary.join('\n');
  fs.appendFileSync(summaryFile, summaryText + '\n');
}

// 2. Benchmark metrics file (array of { name, unit, value }).
const metrics = [
  { name: 'Failed assertions', unit: 'count', value: assertions.failed },
  { name: 'Failed requests', unit: 'count', value: requests.failed },
  { name: 'Avg response time', unit: 'ms', value: responseAverage },
];

fs.writeFileSync(metricsOutPath, JSON.stringify(metrics, null, 2) + '\n');

console.log(
  `Trend metrics: ${assertionsPassed}/${assertions.total} assertions passed, ` +
    `${assertions.failed} failed, avg ${responseAverage}ms`
);
