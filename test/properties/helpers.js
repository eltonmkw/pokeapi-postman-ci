'use strict';
/*
 * Shared helpers for the newman-trend-reporting property tests.
 * Scripts are only ever run as child processes (execFileSync); no network calls.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.join(__dirname, '..', '..');
const METRICS_SCRIPT = path.join(REPO_ROOT, 'scripts', 'newman-trend-metrics.js');
const LINKER_SCRIPT = path.join(REPO_ROOT, 'scripts', 'link-chart-to-reports.js');

// Exact handler the benchmark-action chart contains (matches the linker TARGET).
const HANDLER_EXACT =
  "const url = dataset[index].commit.url;\n                window.open(url, '_blank');";
// Whitespace-varied form that only the tolerant regex matches.
const HANDLER_TOLERANT =
  "const url = dataset[index].commit.url;   window.open(url, '_blank');";

// ---- temp dirs -------------------------------------------------------------

function makeTempDir(prefix = 'trend-prop-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function removeTempDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

// Run fn(dir) with a fresh temp dir that is always cleaned up afterwards.
function withTempDir(fn) {
  const dir = makeTempDir();
  try {
    return fn(dir);
  } finally {
    removeTempDir(dir);
  }
}

// ---- synthetic inputs ------------------------------------------------------

// Minimal Newman-shaped report. Pass `omit` (array of keys among
// 'assertions' | 'requests' | 'responseAverage' | 'failures') to drop fields.
function makeReport({
  assertionsFailed = 0,
  assertionsTotal = 10,
  requestsFailed = 0,
  requestsTotal = 5,
  responseAverage = 42,
  runFailures = 0,
  omit = [],
} = {}) {
  const stats = {};
  if (!omit.includes('assertions')) {
    stats.assertions = { total: assertionsTotal, failed: assertionsFailed };
  }
  if (!omit.includes('requests')) {
    stats.requests = { total: requestsTotal, failed: requestsFailed };
  }
  const timings = {};
  if (!omit.includes('responseAverage')) timings.responseAverage = responseAverage;
  const run = { stats, timings };
  if (!omit.includes('failures')) {
    const n = Array.isArray(runFailures) ? runFailures.length : runFailures;
    run.failures = Array.isArray(runFailures)
      ? runFailures
      : Array.from({ length: n }, (_, i) => ({ error: { message: `failure ${i}` } }));
  }
  return { run };
}

// Synthetic chart HTML holding `count` copies of the click handler.
// variant: 'exact' | 'tolerant' | 'none' (no handler at all).
function buildChartHtml({ count = 1, variant = 'exact', filler = '' } = {}) {
  const handler =
    variant === 'tolerant' ? HANDLER_TOLERANT : variant === 'exact' ? HANDLER_EXACT : '';
  const blocks = [];
  const n = variant === 'none' ? 1 : count;
  for (let i = 0; i < n; i++) {
    blocks.push(
      `            onClick: (_e, elems) => {\n                const index = elems[0].index;\n                ${handler}\n            },`
    );
  }
  return `<!DOCTYPE html>\n<html><body><!--${filler}-->\n<script>\n${blocks.join('\n')}\n</script></body></html>\n`;
}

// ---- child-process wrappers ------------------------------------------------

// Run a script, capturing exit status/stdout/stderr (never throws on non-zero).
function runNode(scriptPath, args, env) {
  const res = spawnSync('node', [scriptPath, ...args], {
    env: Object.assign({}, process.env, env || {}),
    encoding: 'utf8',
  });
  return { status: res.status, stdout: res.stdout, stderr: res.stderr };
}

// Metrics_Extractor wrapper. `args` are the raw positional args.
// `summaryPath` (optional) sets GITHUB_STEP_SUMMARY; when omitted the variable is
// removed from the environment; pass '' to set it empty.
function runScript(args, { summaryPath } = {}) {
  const env = {};
  const base = Object.assign({}, process.env);
  delete base.GITHUB_STEP_SUMMARY;
  if (summaryPath !== undefined) base.GITHUB_STEP_SUMMARY = summaryPath;
  const res = spawnSync('node', [METRICS_SCRIPT, ...args], { env: base, encoding: 'utf8' });
  void env;
  return { status: res.status, stdout: res.stdout, stderr: res.stderr };
}

// Convenience: write `report` to disk in `dir`, run the extractor, return outputs.
function runExtractorOnReport(dir, report, { withSummary = true } = {}) {
  const resultsPath = path.join(dir, 'results.json');
  const metricsPath = path.join(dir, 'metrics.json');
  const summaryPath = path.join(dir, 'summary.md');
  fs.writeFileSync(resultsPath, JSON.stringify(report));
  fs.writeFileSync(summaryPath, '');
  const result = runScript([resultsPath, metricsPath], {
    summaryPath: withSummary ? summaryPath : undefined,
  });
  return {
    ...result,
    metricsPath,
    summaryPath,
    metrics: fs.existsSync(metricsPath) ? JSON.parse(fs.readFileSync(metricsPath, 'utf8')) : null,
    summary: fs.readFileSync(summaryPath, 'utf8'),
  };
}

// Chart_Linker wrapper. `args` are the raw positional args.
function runLinker(args) {
  return runNode(LINKER_SCRIPT, args);
}

module.exports = {
  REPO_ROOT,
  METRICS_SCRIPT,
  LINKER_SCRIPT,
  HANDLER_EXACT,
  HANDLER_TOLERANT,
  makeTempDir,
  removeTempDir,
  withTempDir,
  makeReport,
  buildChartHtml,
  runScript,
  runExtractorOnReport,
  runLinker,
};
