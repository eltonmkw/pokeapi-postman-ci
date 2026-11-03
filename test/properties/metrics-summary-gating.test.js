'use strict';
const test = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const fc = require('fast-check');
const h = require('./helpers');

// Feature: newman-trend-reporting, Property 4: Job_Summary is emitted iff GITHUB_STEP_SUMMARY is set, and never blocks the Metrics_File
// **Validates: Requirements 3.1, 3.5**
test('Property 4: Job_Summary is emitted iff GITHUB_STEP_SUMMARY is set, and never blocks the Metrics_File', () => {
  const SENTINEL = 'PRE-EXISTING\n';
  fc.assert(
    fc.property(
      fc.constantFrom('set', 'unset', 'empty'),
      fc.nat(20),
      fc.nat(20),
      fc.nat(20),
      fc.nat(5000),
      (mode, af, rf, nf, avg) =>
        h.withTempDir((dir) => {
          const resultsPath = path.join(dir, 'results.json');
          const metricsPath = path.join(dir, 'metrics.json');
          const summaryPath = path.join(dir, 'summary.md');
          fs.writeFileSync(
            resultsPath,
            JSON.stringify(
              h.makeReport({
                assertionsFailed: af,
                requestsFailed: rf,
                runFailures: nf,
                responseAverage: avg,
              })
            )
          );
          fs.writeFileSync(summaryPath, SENTINEL);

          const opts =
            mode === 'set' ? { summaryPath } : mode === 'empty' ? { summaryPath: '' } : {};
          const res = h.runScript([resultsPath, metricsPath], opts);

          // Metrics_File is always written, whatever the environment.
          assert.strictEqual(res.status, 0, res.stderr);
          assert.ok(fs.existsSync(metricsPath), 'Metrics_File must exist');
          const metrics = JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
          assert.strictEqual(metrics.length, 3);

          const after = fs.readFileSync(summaryPath, 'utf8');
          if (mode === 'set') {
            assert.ok(after.startsWith(SENTINEL), 'summary is appended, not overwritten');
            assert.ok(after.length > SENTINEL.length, 'Job_Summary appended');
            assert.ok(after.includes('| Metric | Value |'));
          } else {
            assert.strictEqual(after, SENTINEL, 'no summary written when env unset/empty');
          }
          return true;
        })
    ),
    { numRuns: 100 }
  );
});
