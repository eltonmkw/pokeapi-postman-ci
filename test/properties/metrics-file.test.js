'use strict';
const test = require('node:test');
const assert = require('assert');
const fc = require('fast-check');
const h = require('./helpers');

// Feature: newman-trend-reporting, Property 3: Metrics_File always has the three named entries with correct values and zero defaults
// **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3**
test('Metrics_File always has the three named entries with correct values and zero defaults', () => {
  fc.assert(
    fc.property(
      fc.nat(1000),
      fc.nat(1000),
      fc.double({ min: 0, max: 100000, noNaN: true }),
      fc.boolean(),
      fc.boolean(),
      fc.boolean(),
      (af, rf, avg, hasAssertions, hasRequests, hasAvg) => {
        const omit = [];
        if (!hasAssertions) omit.push('assertions');
        if (!hasRequests) omit.push('requests');
        if (!hasAvg) omit.push('responseAverage');
        const report = h.makeReport({
          assertionsFailed: af,
          assertionsTotal: af + 3,
          requestsFailed: rf,
          requestsTotal: rf + 2,
          responseAverage: avg,
          omit,
        });
        return h.withTempDir((dir) => {
          const out = h.runExtractorOnReport(dir, report, { withSummary: false });
          assert.strictEqual(out.status, 0);
          assert.deepStrictEqual(out.metrics, [
            { name: 'Failed assertions', unit: 'count', value: hasAssertions ? af : 0 },
            { name: 'Failed requests', unit: 'count', value: hasRequests ? rf : 0 },
            { name: 'Avg response time', unit: 'ms', value: hasAvg ? Math.round(avg) : 0 },
          ]);
          return true;
        });
      }
    ),
    { numRuns: 100 }
  );
});
