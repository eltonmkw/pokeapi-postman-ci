'use strict';
// Feature: newman-trend-reporting, Property 6: Chart_Linker is a no-op (byte-for-byte) and exits 0 when it cannot act
// **Validates: Requirements 6.1, 6.4**
const test = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const fc = require('fast-check');
const h = require('./helpers');

const HANDLER_RE = /const url = dataset\[index\]\.commit\.url;\s*window\.open\(url, '_blank'\);/;

// Arbitrary HTML-ish text that does not contain the click handler.
const htmlWithoutHandler = fc
  .array(
    fc.oneof(
      fc.string({ maxLength: 40 }),
      fc.constantFrom('<div>', '</div>', '<script>', '</script>', 'window.open(url)', 'const url = 1;', '\n', '  ')
    ),
    { maxLength: 12 }
  )
  .map((parts) => parts.join(''))
  .filter((s) => !HANDLER_RE.test(s));

const shaName = fc.stringMatching(/^[0-9a-f]{7,40}$/);

test('Feature: newman-trend-reporting, Property 6: Chart_Linker is a no-op (byte-for-byte) and exits 0 when it cannot act', () => {
  fc.assert(
    fc.property(
      htmlWithoutHandler,
      fc.uniqueArray(shaName, { maxLength: 4 }),
      fc.constantFrom('with-dir', 'missing-dir', 'dir-is-file'),
      fc.boolean(),
      (html, shas, mode, useHandlerWithBadDir) => {
        h.withTempDir((dir) => {
          const chart = path.join(dir, 'index.html');
          let content = html;
          let reportsDir = path.join(dir, 'reports');

          if (mode === 'with-dir') {
            fs.mkdirSync(reportsDir);
            for (const s of shas) fs.writeFileSync(path.join(reportsDir, `${s}.html`), '<html/>');
          } else if (mode === 'dir-is-file') {
            fs.writeFileSync(reportsDir, 'not a directory');
          }
          // Reports dir unreadable/missing: even a chart WITH the handler must be untouched.
          if (mode !== 'with-dir' && useHandlerWithBadDir) {
            content = h.buildChartHtml({ count: 1, variant: 'exact', filler: html.replace(/-->/g, '') });
          }

          const original = Buffer.from(content, 'utf8');
          fs.writeFileSync(chart, original);

          const res = h.runLinker([chart, reportsDir]);

          assert.strictEqual(res.status, 0, `exit 0 expected, got ${res.status}: ${res.stderr}`);
          assert.ok(fs.readFileSync(chart).equals(original), 'chart bytes unchanged');
        });
      }
    ),
    { numRuns: 100 }
  );
});
