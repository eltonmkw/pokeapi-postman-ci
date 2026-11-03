'use strict';
// Feature: newman-trend-reporting, Property 7: Chart_Linker rewrites every occurrence when the handler is present
// **Validates: Requirements 6.2, 6.3**
const test = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const fc = require('fast-check');
const h = require('./helpers');

const REWRITTEN = 'const sha = dataset[index].commit.id;';
const ORIGINAL = /const url = dataset\[index\]\.commit\.url;\s*window\.open\(url, '_blank'\);/;

function countOf(haystack, needle) {
  return haystack.split(needle).length - 1;
}

function linkChart(html, shas) {
  return h.withTempDir((dir) => {
    const chart = path.join(dir, 'index.html');
    const reports = path.join(dir, 'reports');
    fs.mkdirSync(reports);
    for (const s of shas) fs.writeFileSync(path.join(reports, `${s}.html`), '');
    fs.writeFileSync(chart, html);
    const res = h.runLinker([chart, reports]);
    return { res, out: fs.readFileSync(chart, 'utf8') };
  });
}

const shas = fc.uniqueArray(fc.stringMatching(/^[0-9a-f]{7,40}$/), { minLength: 0, maxLength: 4 });

test('Feature: newman-trend-reporting, Property 7: Chart_Linker rewrites every occurrence when the handler is present', () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 5 }),
      fc.constantFrom('exact', 'tolerant'),
      shas,
      (k, variant, archived) => {
        // Exact form: k occurrences, all rewritten. Tolerant form: one
        // whitespace-varied occurrence, rewritten via the tolerant match.
        const count = variant === 'exact' ? k : 1;
        const { res, out } = linkChart(h.buildChartHtml({ count, variant }), archived);
        assert.strictEqual(res.status, 0);
        assert.strictEqual(countOf(out, REWRITTEN), count, 'every occurrence rewritten');
        assert.ok(!ORIGINAL.test(out), 'no original handler remains');
        return true;
      }
    ),
    { numRuns: 100 }
  );
});
