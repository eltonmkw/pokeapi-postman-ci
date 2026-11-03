'use strict';
const test = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const fc = require('fast-check');
const h = require('./helpers');

const isInvalidJson = (s) => {
  try {
    JSON.parse(s);
    return false;
  } catch (_) {
    return true;
  }
};

// Feature: newman-trend-reporting, Property 9: Metrics_Extractor exits 2 on an unreadable or unparseable report without writing output
// **Validates: Requirements 4.2, 4.3**
test('Metrics_Extractor exits 2 on an unreadable or unparseable report without writing output', () => {
  fc.assert(
    fc.property(
      fc.oneof(
        fc.record({ kind: fc.constant('missing'), name: fc.stringMatching(/^[a-z0-9]{1,12}$/) }),
        fc.record({
          kind: fc.constant('invalid'),
          content: fc.string({ maxLength: 200 }).filter(isInvalidJson),
        })
      ),
      fc.boolean(),
      (input, preexisting) => {
        h.withTempDir((dir) => {
          const resultsPath = path.join(dir, input.kind === 'missing' ? `${input.name}.json` : 'results.json');
          if (input.kind === 'invalid') fs.writeFileSync(resultsPath, input.content);
          const metricsPath = path.join(dir, 'metrics.json');
          const sentinel = 'SENTINEL-DO-NOT-TOUCH';
          if (preexisting) fs.writeFileSync(metricsPath, sentinel);

          const res = h.runScript([resultsPath, metricsPath]);

          assert.strictEqual(res.status, 2);
          assert.ok(res.stderr.trim().length > 0, 'expected an error message on stderr');
          if (preexisting) {
            assert.strictEqual(fs.readFileSync(metricsPath, 'utf8'), sentinel);
          } else {
            assert.strictEqual(fs.existsSync(metricsPath), false);
          }
        });
      }
    ),
    { numRuns: 100 }
  );
});
