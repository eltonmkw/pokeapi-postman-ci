'use strict';
const test = require('node:test');
const assert = require('assert');
const fc = require('fast-check');
const h = require('./helpers');

// Feature: newman-trend-reporting, Property 2: Run-level failures are explained in the summary
// **Validates: Requirements 3.4**
test('Script/other failures row is present iff run.failures.length > 0', () => {
  fc.assert(
    fc.property(fc.nat(5), fc.nat(5), fc.nat(5), (af, rf, nf) =>
      h.withTempDir((dir) => {
        const out = h.runExtractorOnReport(
          dir,
          h.makeReport({ assertionsFailed: af, requestsFailed: rf, runFailures: nf })
        );
        assert.strictEqual(out.status, 0);
        assert.strictEqual(out.summary.includes('Script/other failures'), nf > 0);
        return true;
      })
    ),
    { numRuns: 100 }
  );
});
