'use strict';
// Feature: newman-trend-reporting, Property 8: Both scripts exit 2 on invalid invocation without writing output
// **Validates: Requirements 4.1, 7.1**
const test = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const fc = require('fast-check');
const h = require('./helpers');

// Snapshot of a directory: file name -> contents.
function snapshot(dir) {
  const out = {};
  for (const name of fs.readdirSync(dir).sort()) {
    out[name] = fs.readFileSync(path.join(dir, name), 'utf8');
  }
  return out;
}

// Zero or one positional argument. When one is given, it is either an existing
// file (valid input) or an arbitrary non-flag token.
const argCount = fc.constantFrom(0, 1);
const useRealFile = fc.boolean();
const token = fc.stringMatching(/^[A-Za-z0-9_.]{1,20}$/);

test('Feature: newman-trend-reporting, Property 8: Both scripts exit 2 on invalid invocation without writing output', () => {
  fc.assert(
    fc.property(argCount, useRealFile, token, (n, real, tok) => {
      h.withTempDir((dir) => {
        const results = path.join(dir, 'results.json');
        const chart = path.join(dir, 'index.html');
        fs.writeFileSync(results, JSON.stringify(h.makeReport()));
        fs.writeFileSync(chart, h.buildChartHtml({ count: 1, variant: 'exact' }));
        const before = snapshot(dir);

        const metricsArgs = n === 0 ? [] : [real ? results : path.join(dir, tok)];
        const linkerArgs = n === 0 ? [] : [real ? chart : path.join(dir, tok)];

        const m = h.runScript(metricsArgs);
        assert.strictEqual(m.status, 2, `extractor args=${JSON.stringify(metricsArgs)}`);
        assert.deepStrictEqual(snapshot(dir), before, 'extractor wrote output');

        const l = h.runLinker(linkerArgs);
        assert.strictEqual(l.status, 2, `linker args=${JSON.stringify(linkerArgs)}`);
        assert.deepStrictEqual(snapshot(dir), before, 'linker modified files');
      });
    }),
    { numRuns: 100 }
  );
});
