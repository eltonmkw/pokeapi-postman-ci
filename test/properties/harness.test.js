'use strict';
// Smoke test for the property-test harness. Property tests 1-10 will be added
// in this directory and reuse ./helpers.js.
const test = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const fc = require('fast-check');
const h = require('./helpers');

test('fast-check runs and helpers drive both scripts as child processes', () => {
  fc.assert(
    fc.property(fc.nat(5), fc.nat(5), (af, nf) => {
      return h.withTempDir((dir) => {
        const out = h.runExtractorOnReport(dir, h.makeReport({ assertionsFailed: af, runFailures: nf }));
        assert.strictEqual(out.status, 0);
        assert.strictEqual(out.summary.includes('❌ fail'), af + nf > 0);
        return true;
      });
    }),
    { numRuns: 100 }
  );
});

test('linker wrapper rewrites a synthetic chart', () => {
  h.withTempDir((dir) => {
    const chart = path.join(dir, 'index.html');
    const reports = path.join(dir, 'reports');
    fs.mkdirSync(reports);
    fs.writeFileSync(path.join(reports, 'abc123.html'), '');
    fs.writeFileSync(chart, h.buildChartHtml({ count: 2 }));
    const res = h.runLinker([chart, reports]);
    assert.strictEqual(res.status, 0);
    const html = fs.readFileSync(chart, 'utf8');
    assert.ok(html.includes('"abc123"') && html.includes('./reports/'));
  });
});
