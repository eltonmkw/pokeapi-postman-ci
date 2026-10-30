#!/usr/bin/env node
/*
 * Layer 4 guard: lint a Postman collection to enforce the "unauthenticated
 * public PokéAPI only" invariant. The collection exercises the public PokéAPI,
 * so it must NEVER carry credentials: no auth blocks, no Authorization /
 * x-api-key headers, and no host other than pokeapi.co. Any of those could leak
 * a secret or PII into the public htmlextra report that gets published to
 * GitHub Pages.
 *
 * Usage:
 *   node scripts/check-collection-no-auth.js [collection.json]
 *
 * The argument defaults to postman/pokeapi.postman_collection.json when omitted.
 *
 * Exit codes:
 *   0  clean       - no violations found
 *   1  violations  - one or more invariant violations found (all are printed)
 *   2  usage/read  - could not read or parse the collection JSON
 *
 * The walk is RECURSIVE and collects ALL violations before exiting (it does not
 * stop at the first), so a single run surfaces every problem at once.
 */
'use strict';

const fs = require('fs');

const DEFAULT_COLLECTION = 'postman/pokeapi.postman_collection.json';

// The only host this collection may ever talk to.
const ALLOWED_HOST = 'pokeapi.co';
const ALLOWED_BASE_URL = 'https://pokeapi.co';

// Header keys that indicate credentials. Matched case-insensitively.
const FORBIDDEN_HEADER_KEYS = ['authorization', 'x-api-key'];

const collectionPath = process.argv[2] || DEFAULT_COLLECTION;

let collection;
try {
  collection = JSON.parse(fs.readFileSync(collectionPath, 'utf8'));
} catch (err) {
  console.error(`Could not read/parse collection at ${collectionPath}: ${err.message}`);
  process.exit(2);
}

// Accumulate human-readable violation strings (path/location + what is wrong).
const violations = [];

function addViolation(location, message) {
  violations.push(`${location}: ${message}`);
}

// --- auth block check -------------------------------------------------------
// An 'auth' object is a violation unless it is explicitly {"type":"noauth"}.
// May appear at the collection root, on a folder item, or on a request.
function checkAuth(authObj, location) {
  if (!authObj || typeof authObj !== 'object') {
    return;
  }
  const type = authObj.type;
  if (type !== 'noauth') {
    addViolation(location, `auth block of type '${type}' is not allowed (only 'noauth')`);
  }
}

// --- header check -----------------------------------------------------------
// Walk a header array and flag any Authorization / x-api-key key, case-insensitively.
function checkHeaders(headers, location) {
  if (!Array.isArray(headers)) {
    return;
  }
  headers.forEach((header, index) => {
    if (!header || typeof header !== 'object' || typeof header.key !== 'string') {
      return;
    }
    const key = header.key.toLowerCase();
    if (FORBIDDEN_HEADER_KEYS.indexOf(key) !== -1) {
      addViolation(`${location} header[${index}]`, `forbidden credential header '${header.key}'`);
    }
  });
}

// --- host check -------------------------------------------------------------
// Extract candidate host/URL strings and verify they stay on pokeapi.co. The
// {{base_url}} placeholder token is allowed (it resolves to the vetted base_url
// collection variable, which is checked separately).
function hostIsAllowed(value) {
  if (typeof value !== 'string') {
    return true; // nothing concrete to check
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    return true;
  }
  // Allow the raw placeholder token anywhere (bare or as a URL prefix).
  if (trimmed === '{{base_url}}' || trimmed.indexOf('{{base_url}}') === 0) {
    return true;
  }
  // A bare host token like 'pokeapi.co'.
  if (trimmed === ALLOWED_HOST) {
    return true;
  }
  // Try to parse as a URL and compare the hostname.
  let host = trimmed;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      host = new URL(trimmed).hostname;
    } catch (_) {
      // Fall through and treat the raw string as the host below.
    }
  }
  return host === ALLOWED_HOST;
}

function checkUrl(url, location) {
  if (!url) {
    return;
  }
  // url may be a plain string or an object with raw/host.
  if (typeof url === 'string') {
    if (!hostIsAllowed(url)) {
      addViolation(location, `request URL '${url}' is not on ${ALLOWED_HOST}`);
    }
    return;
  }
  if (typeof url !== 'object') {
    return;
  }
  // Prefer url.raw when present.
  if (typeof url.raw === 'string') {
    if (!hostIsAllowed(url.raw)) {
      addViolation(location, `request URL '${url.raw}' is not on ${ALLOWED_HOST}`);
    }
    return;
  }
  // Otherwise fall back to url.host, which may be a string or an array of segments.
  let hostStr;
  if (Array.isArray(url.host)) {
    hostStr = url.host.join('.');
  } else if (typeof url.host === 'string') {
    hostStr = url.host;
  }
  if (hostStr !== undefined && !hostIsAllowed(hostStr)) {
    addViolation(location, `request host '${hostStr}' is not on ${ALLOWED_HOST}`);
  }
}

// --- request check ----------------------------------------------------------
function checkRequest(request, location) {
  if (!request || typeof request !== 'object') {
    return;
  }
  checkAuth(request.auth, `${location} request.auth`);
  checkHeaders(request.header, `${location} request`);
  checkUrl(request.url, location);
}

// --- recursive item walk ----------------------------------------------------
// Each item is either a folder (has an 'item' array) or a request (has a
// 'request' object). Both may carry their own 'auth' and folder-level 'header'.
function walkItems(items, prefix) {
  if (!Array.isArray(items)) {
    return;
  }
  items.forEach((item, index) => {
    if (!item || typeof item !== 'object') {
      return;
    }
    const name = typeof item.name === 'string' ? item.name : `#${index}`;
    const location = `${prefix}/${name}`;
    // Folder- or item-level auth and headers.
    checkAuth(item.auth, `${location} auth`);
    checkHeaders(item.header, location);
    if (Array.isArray(item.item)) {
      // Folder: recurse.
      walkItems(item.item, location);
    }
    if (item.request) {
      // Request item.
      checkRequest(item.request, location);
    }
  });
}

// --- base_url variable check ------------------------------------------------
// The {{base_url}} variable itself must resolve to exactly https://pokeapi.co.
function checkVariables(variables) {
  if (!Array.isArray(variables)) {
    return;
  }
  variables.forEach((entry) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }
    if (entry.key === 'base_url') {
      if (entry.value !== ALLOWED_BASE_URL) {
        addViolation(
          'variable base_url',
          `base_url is '${entry.value}' but must be '${ALLOWED_BASE_URL}'`
        );
      }
    }
  });
}

// --- run all checks ---------------------------------------------------------
// Collection-level auth.
checkAuth(collection.auth, 'collection auth');
// Collection-level headers (rarely present, but check if they are).
checkHeaders(collection.header, 'collection');
// The base_url variable.
checkVariables(collection.variable);
// Recurse through folders and requests.
walkItems(collection.item, 'collection');

if (violations.length > 0) {
  console.error(`Collection ${collectionPath} violates the no-auth / pokeapi.co-only invariant:`);
  violations.forEach((v) => console.error(`  - ${v}`));
  console.error(
    `${violations.length} violation(s) found. The collection must stay unauthenticated ` +
      'against the public PokéAPI so no secret/PII can leak into the public report.'
  );
  process.exit(1);
}

console.log(
  `OK - ${collectionPath} is clean: no auth blocks, no Authorization/x-api-key headers, host is ${ALLOWED_HOST} only.`
);
