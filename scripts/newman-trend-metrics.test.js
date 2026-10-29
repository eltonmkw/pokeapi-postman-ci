#!/usr/bin/env node
/*
 * Self-contained, dependency-free test for scripts/newman-trend-metrics.js.
 *
 * It proves the job-summary verdict reflects ALL Newman failures, not just
 * failed assertions. Run it with plain Node (no npm install, no test runner):
 *
 *   node scripts/newman-trend-metrics.test.js
 *
 * Each case writes a synthetic Newman JSON report to a temp file, runs the real
 * script as a child process with GITHUB_STEP_SUMMARY pointed at a temp file,
 * then asserts the verdict substring written to that summary file.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const scriptPath = path.join(__dirname, 'newman-trend-metrics.js');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trend-metrics-'));
const created = [];

function tmpFile(name) {
  const p = path.join(tmpDir, name);
  created.push(p);
  return p;
}

// Build a minimal Newman-shaped report. Overrides let each case tweak the
// failure counts and run.failures array that drive the verdict.
function makeReport({ assertionsFailed = 0, requestsFailed = 0, runFailures = [] }) {
  return {
    run: {
      stats: {
        assertions: { total: 10, failed: assertionsFailed },
        requests: { total: 5, failed: requestsFailed },
      },
      timings: { responseAverage: 42 },
      failures: runFailures,
    },
  };
}

// Run the script against a synthetic report and return the summary text.
function runScript(report, label) {
  const resultsPath = tmpFile(`${label}.results.json`);
  const metricsPath = tmpFile(`${label}.metrics.json`);
  const summaryPath = tmpFile(`${label}.summary.md`);
  fs.writeFileSync(resultsPath, JSON.stringify(report));
  fs.writeFileSync(summaryPath, '');
  execFileSync('node', [scriptPath, resultsPath, metricsPath], {
    env: Object.assign({}, process.env, { GITHUB_STEP_SUMMARY: summaryPath }),
    stdio: 'ignore',
  });
  return fs.readFileSync(summaryPath, 'utf8');
}

let failed = false;
function check(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    failed = true;
    console.error(`not ok - ${name}`);
    console.error(err.message);
  }
}

// (1) Fully passing run: no failed assertions, no failed requests, no run
// failures -> verdict must be a pass.
check('passing run reports pass', () => {
  const summary = runScript(makeReport({}), 'pass');
  assert.ok(summary.includes('✅ pass'), 'expected pass verdict');
  assert.ok(!summary.includes('❌ fail'), 'did not expect fail verdict');
});

// (2) Regression the fix addresses: zero failed assertions BUT a failed request
// and a run.failures entry -> verdict must be a fail.
check('failed request with zero failed assertions reports fail', () => {
  const summary = runScript(
    makeReport({
      assertionsFailed: 0,
      requestsFailed: 1,
      runFailures: [{ error: { test: 'Get Pikachu', message: 'Unexpected token' } }],
    }),
    'request-fail'
  );
  assert.ok(summary.includes('❌ fail'), 'expected fail verdict');
  assert.ok(!summary.includes('✅ pass'), 'did not expect pass verdict');
  // The optional run-level row should explain the fail.
  assert.ok(summary.includes('Script/other failures'), 'expected run-failure row');
});

// (3) Failed assertion -> verdict must be a fail.
check('failed assertion reports fail', () => {
  const summary = runScript(makeReport({ assertionsFailed: 2 }), 'assert-fail');
  assert.ok(summary.includes('❌ fail'), 'expected fail verdict');
});

// Clean up temp files and directory.
for (const p of created) {
  try {
    fs.unlinkSync(p);
  } catch (_) {
    // ignore
  }
}
try {
  fs.rmdirSync(tmpDir);
} catch (_) {
  // ignore
}

if (failed) {
  console.error('FAILED');
  process.exit(1);
}
console.log('OK - all newman-trend-metrics verdict cases passed');
