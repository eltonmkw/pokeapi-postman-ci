#!/usr/bin/env node
/*
 * Self-contained, dependency-free test for scripts/redact-report.js.
 *
 * It proves the Layer 5 redactor masks bearer tokens, labelled api-key/token
 * values, and email addresses with [REDACTED] while leaving a normal htmlextra
 * report body (status codes, 'pikachu', assertion names) untouched, and that
 * redaction is idempotent. Run it with plain Node (no npm install, no runner):
 *
 *   node scripts/redact-report.test.js
 *
 * Each case writes input HTML to a temp file, runs the real script as a child
 * process to produce an output file, then asserts on the output contents.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const scriptPath = path.join(__dirname, 'redact-report.js');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'redact-'));
const created = [];

function tmpFile(name) {
  const p = path.join(tmpDir, name);
  created.push(p);
  return p;
}

// Write input HTML, run the redactor, return the output text.
function redact(inputHtml, label) {
  const inPath = tmpFile(`${label}.in.html`);
  const outPath = tmpFile(`${label}.out.html`);
  fs.writeFileSync(inPath, inputHtml);
  execFileSync('node', [scriptPath, inPath, outPath], { stdio: 'ignore' });
  return fs.readFileSync(outPath, 'utf8');
}

let failed = false;
function check(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    failed = true;
    console.error(`not ok - ${name}`);
    console.error(err.message);
  }
}

// (1) Bearer token is masked and the raw value is gone.
check('bearer token is redacted', () => {
  const out = redact('<p>Authorization: Bearer abc123tokenVALUE</p>', 'bearer');
  assert.ok(out.includes('[REDACTED]'), 'expected [REDACTED] in output');
  assert.ok(!out.includes('abc123tokenVALUE'), 'raw bearer token must not survive');
});

// (2) An api-key value is masked.
check('api key value is redacted', () => {
  const out = redact('<td>x-api-key: 9f8e7d6c5b4a</td>', 'apikey');
  assert.ok(out.includes('[REDACTED]'), 'expected [REDACTED] in output');
  assert.ok(!out.includes('9f8e7d6c5b4a'), 'raw api key must not survive');
});

// (3) An email address is masked.
check('email address is redacted', () => {
  const out = redact('<span>contact jane.doe@example.com for access</span>', 'email');
  assert.ok(out.includes('[REDACTED]'), 'expected [REDACTED] in output');
  assert.ok(!out.includes('jane.doe@example.com'), 'raw email must not survive');
});

// (4) A clean htmlextra-like report body is unchanged (no over-redaction).
const cleanReport = [
  '<html><body>',
  '<h1>PokéAPI CI run</h1>',
  '<table>',
  '<tr><td>Get Pikachu</td><td>status code is 200</td><td>Passed</td></tr>',
  '<tr><td>Get Pikachu</td><td>name is \'pikachu\'</td><td>Passed</td></tr>',
  '<tr><td>Nonexistent Pokémon returns 404</td><td>status code is 404</td><td>Passed</td></tr>',
  '<tr><td>List first 5 Pokémon</td><td>results array has length 5</td><td>Passed</td></tr>',
  '</table>',
  '<p>Average response time: 42 ms. Total assertions: 25.</p>',
  '</body></html>',
].join('\n');

check('clean report is unchanged (no over-redaction)', () => {
  const out = redact(cleanReport, 'clean');
  assert.strictEqual(out, cleanReport, 'clean report must pass through untouched');
  assert.ok(out.includes('pikachu'), "'pikachu' must survive");
  assert.ok(out.includes('status code is 200'), 'assertion name must survive');
  assert.ok(out.includes('status code is 404'), '404 assertion name must survive');
  assert.ok(!out.includes('[REDACTED]'), 'clean report must not gain any [REDACTED]');
});

// (5) HTML-entity-encoded JSON body (the shape htmlextra actually emits).
//     htmlextra HTML-escapes request/response bodies, so a leaked key renders
//     as &quot;api_key&quot;: &quot;SECRET&quot;. This MUST still be masked; a
//     plaintext-only redactor would miss it and publish the secret.
check('html-escaped JSON body secret is redacted', () => {
  const input = '<pre>{ &quot;api_key&quot;: &quot;SECRET_ABC123&quot; }</pre>';
  const out = redact(input, 'escaped-json');
  assert.ok(out.includes('[REDACTED]'), 'expected [REDACTED] in output');
  assert.ok(!out.includes('SECRET_ABC123'), 'escaped secret value must not survive');
  // The entity-encoded quotes must be preserved so the HTML stays valid.
  assert.ok(out.includes('&quot;api_key&quot;'), 'escaped label must stay readable');
  assert.ok(out.includes('&quot;[REDACTED]&quot;'), 'value stays entity-quoted');
});

// (5b) Numeric entity form (&#34;) for the quotes is also masked.
check('html-escaped numeric-entity secret is redacted', () => {
  const input = '<pre>&#34;secret&#34;: &#34;TOPSECRET987&#34;</pre>';
  const out = redact(input, 'escaped-num');
  assert.ok(!out.includes('TOPSECRET987'), 'numeric-entity secret value must not survive');
  assert.ok(out.includes('[REDACTED]'), 'expected [REDACTED] in output');
});

// (6) Basic-auth credential is fully masked, not just the scheme word. A
//     plaintext-only fix that stops at whitespace would leave the base64 blob.
check('basic auth credential is redacted', () => {
  const out = redact('<p>authorization: Basic dXNlcjpwYXNzd29yZA==</p>', 'basic');
  assert.ok(out.includes('[REDACTED]'), 'expected [REDACTED] in output');
  assert.ok(!out.includes('dXNlcjpwYXNzd29yZA'), 'raw basic credential must not survive');
  assert.ok(!out.includes('Basic dXNlcjpwYXNz'), 'scheme + credential must not survive');
});

// (7) The newly-covered labels (cookie, session, password) are masked.
check('cookie / session / password values are redacted', () => {
  const cookie = redact('<td>cookie: session=abc123secretvalue</td>', 'cookie');
  assert.ok(!cookie.includes('abc123secretvalue'), 'cookie value must not survive');
  const session = redact('<td>session: sess_9f8e7d6c5b4a3210</td>', 'session');
  assert.ok(!session.includes('sess_9f8e7d6c5b4a3210'), 'session value must not survive');
  const password = redact('<td>password: hunter2longvalue</td>', 'password');
  assert.ok(!password.includes('hunter2longvalue'), 'password value must not survive');
});

// (8) Idempotency: redacting already-redacted output yields the same output,
//     including the HTML-escaped and Basic-auth shapes.
check('redaction is idempotent', () => {
  const dirty = [
    '<p>Authorization: Bearer abc123tokenVALUE</p>',
    '<p>authorization: Basic dXNlcjpwYXNzd29yZA==</p>',
    '<td>x-api-key: 9f8e7d6c5b4a</td>',
    '<pre>{ &quot;api_key&quot;: &quot;SECRET_ABC123&quot; }</pre>',
    '<td>password: hunter2longvalue</td>',
    '<span>jane.doe@example.com</span>',
  ].join('\n');
  const once = redact(dirty, 'idem-once');
  const twice = redact(once, 'idem-twice');
  assert.strictEqual(twice, once, 'second redaction must not change already-redacted output');
});

// Clean up temp files and directory.
for (const p of created) {
  try {
    fs.unlinkSync(p);
  } catch (_) {
    // ignore
  }
}
try {
  fs.rmdirSync(tmpDir);
} catch (_) {
  // ignore
}

if (failed) {
  console.error('FAILED');
  process.exit(1);
}
console.log('OK - all redact-report cases passed');
