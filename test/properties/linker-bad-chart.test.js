'use strict';
// Feature: newman-trend-reporting, Property 10: Chart_Linker exits 2 on an unreadable chart without modifying it
// **Validates: Requirements 7.2**
const test = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const fc = require('fast-check');
const h = require('./helpers');

const name = fc.stringMatching(/^[a-z0-9]{1,12}$/);
const prefix = fc.option(fc.constantFrom('./reports/', '../reports/', 'archive/'), { nil: undefined });

function snapshot(dir) {
  const out = {};
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    out[f] = fs.statSync(p).isDirectory() ? snapshot(p) : fs.readFileSync(p, 'utf8');
  }
  return out;
}

test('Feature: newman-trend-reporting, Property 10: Chart_Linker exits 2 on an unreadable chart without modifying it', () => {
  fc.assert(
    fc.property(
      name,
      fc.constantFrom('exact', 'tolerant', 'none'),
      fc.uniqueArray(fc.stringMatching(/^[0-9a-f]{7,40}$/), { minLength: 0, maxLength: 4 }),
      prefix,
      (missingName, variant, archived, linkPrefix) => {
        return h.withTempDir((dir) => {
          const reports = path.join(dir, 'reports');
          fs.mkdirSync(reports);
          for (const s of archived) fs.writeFileSync(path.join(reports, `${s}.html`), '');
          // Bystander chart HTML that must remain untouched.
          fs.writeFileSync(path.join(dir, 'other.html'), h.buildChartHtml({ count: 2, variant }));

          const missing = path.join(dir, 'nonexistent-' + missingName, 'index.html');
          const before = snapshot(dir);
          const args = linkPrefix === undefined ? [missing, reports] : [missing, reports, linkPrefix];
          const res = h.runLinker(args);

          assert.strictEqual(res.status, 2);
          assert.ok(res.stderr.trim().length > 0, 'error message written to stderr');
          assert.ok(!fs.existsSync(missing), 'unreadable chart path not created');
          assert.deepStrictEqual(snapshot(dir), before, 'no files modified');
          return true;
        });
      }
    ),
    { numRuns: 100 }
  );
});
