#!/usr/bin/env node
/*
 * Self-contained, dependency-free test for scripts/check-collection-no-auth.js.
 *
 * It proves the Layer 4 linter passes the REAL collection and fails every way a
 * credential or off-host URL could sneak in. Run it with plain Node (no npm
 * install, no test runner):
 *
 *   node scripts/check-collection-no-auth.test.js
 *
 * Each case writes a (possibly mutated) collection to a temp file, runs the real
 * script as a child process capturing its exit code + stdout/stderr, then
 * asserts the exit code. Dirty fixtures are built by deep-cloning the parsed
 * real collection and mutating it so they stay realistic.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const scriptPath = path.join(__dirname, 'check-collection-no-auth.js');
const realCollectionPath = path.join(__dirname, '..', 'postman', 'pokeapi.postman_collection.json');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'no-auth-'));
const created = [];

function tmpFile(name) {
  const p = path.join(tmpDir, name);
  created.push(p);
  return p;
}

// Parse the real collection once; clone per case so mutations don't leak.
const realCollection = JSON.parse(fs.readFileSync(realCollectionPath, 'utf8'));
function cloneReal() {
  return JSON.parse(JSON.stringify(realCollection));
}

// Find the first request item in a collection (depth-first) so dirty fixtures
// can mutate a realistic request.
function firstRequestItem(items) {
  for (const item of items) {
    if (item.request) {
      return item;
    }
    if (Array.isArray(item.item)) {
      const found = firstRequestItem(item.item);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

// Run the script against a collection path and return { code, output }.
function runLinter(collectionPath) {
  try {
    const stdout = execFileSync('node', [scriptPath, collectionPath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, output: stdout };
  } catch (err) {
    return { code: typeof err.status === 'number' ? err.status : 1, output: String(err.stderr || '') };
  }
}

// Write a collection object to a temp file and lint it.
function lintObject(obj, label) {
  const p = tmpFile(`${label}.json`);
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
  return runLinter(p);
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

// (1) The real repo collection is clean -> exit 0.
check('real collection passes (exit 0)', () => {
  const res = runLinter(realCollectionPath);
  assert.strictEqual(res.code, 0, `expected exit 0, got ${res.code}: ${res.output}`);
});

// (2) An auth block of type 'bearer' on a request -> non-zero.
check('request auth block type bearer fails (non-zero)', () => {
  const c = cloneReal();
  const req = firstRequestItem(c.item);
  req.request.auth = {
    type: 'bearer',
    bearer: [{ key: 'token', value: 'abc123', type: 'string' }],
  };
  const res = lintObject(c, 'auth-bearer');
  assert.notStrictEqual(res.code, 0, 'expected non-zero for bearer auth block');
});

// (3) An 'Authorization' request header -> non-zero.
check('Authorization header fails (non-zero)', () => {
  const c = cloneReal();
  const req = firstRequestItem(c.item);
  req.request.header.push({ key: 'Authorization', value: 'Bearer secret', type: 'text' });
  const res = lintObject(c, 'authz-header');
  assert.notStrictEqual(res.code, 0, 'expected non-zero for Authorization header');
});

// (4) A mixed-case 'X-API-KEY' request header -> non-zero (proves case-insensitivity).
check('X-API-KEY header (mixed case) fails (non-zero)', () => {
  const c = cloneReal();
  const req = firstRequestItem(c.item);
  req.request.header.push({ key: 'X-API-KEY', value: '9f8e7d6c5b4a', type: 'text' });
  const res = lintObject(c, 'xapikey-header');
  assert.notStrictEqual(res.code, 0, 'expected non-zero for X-API-KEY header');
});

// (5) A request URL host of evil.example.com -> non-zero.
check('off-host request URL fails (non-zero)', () => {
  const c = cloneReal();
  const req = firstRequestItem(c.item);
  req.request.url = {
    raw: 'https://evil.example.com/api/v2/pokemon/pikachu/',
    host: ['evil', 'example', 'com'],
    path: ['api', 'v2', 'pokemon', 'pikachu', ''],
  };
  const res = lintObject(c, 'evil-host');
  assert.notStrictEqual(res.code, 0, 'expected non-zero for evil.example.com host');
});

// (6) A base_url variable pointing off pokeapi.co -> non-zero.
check('off-host base_url variable fails (non-zero)', () => {
  const c = cloneReal();
  (c.variable || []).forEach((v) => {
    if (v.key === 'base_url') {
      v.value = 'https://evil.example.com';
    }
  });
  const res = lintObject(c, 'evil-base-url');
  assert.notStrictEqual(res.code, 0, 'expected non-zero for off-host base_url');
});

// (6b) A URL that smuggles a host onto the {{base_url}} token via a suffix
//      ('{{base_url}}.evil.example.com') must NOT be treated as on-host -> non-zero.
check('{{base_url}}-prefix host smuggle fails (non-zero)', () => {
  const c = cloneReal();
  const req = firstRequestItem(c.item);
  req.request.url = {
    raw: '{{base_url}}.evil.example.com/api/v2/pokemon/pikachu/',
    host: ['{{base_url}}.evil.example.com'],
    path: ['api', 'v2', 'pokemon', 'pikachu', ''],
  };
  const res = lintObject(c, 'baseurl-smuggle');
  assert.notStrictEqual(res.code, 0, 'expected non-zero for {{base_url}}.evil host smuggle');
});

// (6c) A legitimate {{base_url}} URL (token followed by a path) still passes -> exit 0.
check('legitimate {{base_url}} URL passes (exit 0)', () => {
  const c = cloneReal();
  const req = firstRequestItem(c.item);
  req.request.url = {
    raw: '{{base_url}}/api/v2/pokemon/pikachu/',
    host: ['{{base_url}}'],
    path: ['api', 'v2', 'pokemon', 'pikachu', ''],
  };
  const res = lintObject(c, 'baseurl-ok');
  assert.strictEqual(res.code, 0, `expected exit 0 for legit {{base_url}} URL, got ${res.code}: ${res.output}`);
});

// (7) An explicit {"type":"noauth"} auth block is allowed -> exit 0.
check('explicit noauth block passes (exit 0)', () => {
  const c = cloneReal();
  c.auth = { type: 'noauth' };
  const req = firstRequestItem(c.item);
  req.request.auth = { type: 'noauth' };
  const res = lintObject(c, 'noauth');
  assert.strictEqual(res.code, 0, `expected exit 0 for noauth, got ${res.code}: ${res.output}`);
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
console.log('OK - all check-collection-no-auth cases passed');
