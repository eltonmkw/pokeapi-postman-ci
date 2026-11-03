'use strict';
const test = require('node:test');
const assert = require('assert');
const fc = require('fast-check');
const h = require('./helpers');

// Feature: newman-trend-reporting, Property 1: Verdict is fail iff some failure category is non-zero
// Validates: Requirements 3.2, 3.3
test('Property 1: verdict is fail iff af+rf+nf > 0, pass iff all zero', () => {
  // Bias toward zeros so the all-zero (pass) case is exercised often.
  const count = fc.oneof({ weight: 1, arbitrary: fc.constant(0) }, { weight: 2, arbitrary: fc.nat(20) });
  fc.assert(
    fc.property(count, count, count, (af, rf, nf) => {
      return h.withTempDir((dir) => {
        const out = h.runExtractorOnReport(
          dir,
          h.makeReport({ assertionsFailed: af, requestsFailed: rf, runFailures: nf })
        );
        assert.strictEqual(out.status, 0);
        const failing = af + rf + nf > 0;
        assert.ok(out.summary.includes('| Result | ❌ fail |') === failing);
        assert.ok(out.summary.includes('| Result | ✅ pass |') === !failing);
        return true;
      });
    }),
    { numRuns: 100 }
  );
});
