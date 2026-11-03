'use strict';
// Feature: newman-trend-reporting, Property 5: Chart_Linker links matched SHAs and falls back otherwise
// **Validates: Requirements 5.1, 5.2, 5.3, 5.4**
//
// KNOWN GAP (Requirements 10 and 11): report archival (Req 10) and the
// multi-path site layout (Req 11) are an accepted, documented known gap. The
// Chart_Linker is built and verified in isolation here, but it is not wired
// into the `deploy-pages` job, so these requirements are intentionally not
// covered by tests. See the "Implementation state vs. requirements" table in
// .kiro/specs/newman-trend-reporting/design.md.
const test = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const fc = require('fast-check');
const h = require('./helpers');

const sha = fc.stringMatching(/^[0-9a-f]{7,40}$/);
const prefix = fc.option(fc.constantFrom('./reports/', '../reports/', 'archive/', '/r/'), { nil: undefined });

// Extract the rewritten handler body and run it for one data point.
function resolve(html, commit) {
  const start = html.indexOf('const sha = dataset[index].commit.id;');
  assert.ok(start !== -1, 'rewritten handler present');
  const endMarker = "window.open(url, '_blank');";
  const end = html.indexOf(endMarker, start) + endMarker.length;
  const body = html.slice(start, end);
  let opened = null;
  vm.runInNewContext(`(function(){ ${body} })()`, {
    dataset: [{ commit }],
    index: 0,
    window: { open: (u) => { opened = u; } },
  });
  return opened;
}

test('Feature: newman-trend-reporting, Property 5: Chart_Linker links matched SHAs and falls back otherwise', () => {
  fc.assert(
    fc.property(
      fc.uniqueArray(sha, { minLength: 0, maxLength: 8 }),
      fc.uniqueArray(sha, { minLength: 1, maxLength: 5 }),
      fc.constantFrom('exact', 'tolerant'),
      fc.integer({ min: 1, max: 3 }),
      prefix,
      (archived, others, variant, count, linkPrefix) => {
        const missing = others.filter((s) => !archived.includes(s));
        return h.withTempDir((dir) => {
          const chart = path.join(dir, 'index.html');
          const reports = path.join(dir, 'reports');
          fs.mkdirSync(reports);
          for (const s of archived) fs.writeFileSync(path.join(reports, `${s}.html`), '');
          fs.writeFileSync(chart, h.buildChartHtml({ count, variant }));

          const res = h.runLinker(linkPrefix === undefined ? [chart, reports] : [chart, reports, linkPrefix]);
          assert.strictEqual(res.status, 0);
          const html = fs.readFileSync(chart, 'utf8');
          const expectedPrefix = linkPrefix === undefined ? './reports/' : linkPrefix;

          const m = html.match(/const REPORTS = (\[.*?\]);/);
          assert.ok(m, 'REPORTS array present');
          assert.deepStrictEqual([...JSON.parse(m[1])].sort(), [...archived].sort());

          for (const id of archived) {
            assert.strictEqual(resolve(html, { id, url: 'https://example.com/c/' + id }), expectedPrefix + id + '.html');
          }
          for (const id of missing) {
            const url = 'https://example.com/c/' + id;
            assert.strictEqual(resolve(html, { id, url }), url);
          }
          return true;
        });
      }
    ),
    { numRuns: 100 }
  );
});
