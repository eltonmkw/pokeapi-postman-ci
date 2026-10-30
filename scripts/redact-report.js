#!/usr/bin/env node
/*
 * Layer 5 guard: redact secrets and PII from a Newman htmlextra HTML report
 * BEFORE it is published to the public GitHub Pages site. Even though the
 * collection is supposed to stay unauthenticated (enforced by Layer 4), this is
 * a defense-in-depth backstop: if a credential, token, or email ever reaches
 * the report body, this masks it so nothing sensitive is published.
 *
 * Usage:
 *   node scripts/redact-report.js <input.html> <output.html>
 *
 * It reads the input HTML, replaces each sensitive match with the literal
 * string [REDACTED], writes the result to the output path, and prints a short
 * substitution-count summary.
 *
 * Exit codes:
 *   0  success
 *   2  usage/read error
 *
 * Design goals:
 *   - Conservative: redact clearly-labelled secrets (Bearer tokens, api-key /
 *     authorization / token / secret assignments) and email addresses, NOT
 *     arbitrary alphanumeric strings. The normally-useful report (status codes,
 *     'pikachu', assertion names) must survive untouched.
 *   - Idempotent: running twice must not corrupt already-redacted output. The
 *     patterns never match the literal placeholder [REDACTED], so re-running is
 *     a no-op on already-clean text.
 */
'use strict';

const fs = require('fs');

const REDACTED = '[REDACTED]';

const [, , inputPath, outputPath] = process.argv;

if (!inputPath || !outputPath) {
  console.error('Usage: redact-report.js <input.html> <output.html>');
  process.exit(2);
}

let html;
try {
  html = fs.readFileSync(inputPath, 'utf8');
} catch (err) {
  console.error(`Could not read input at ${inputPath}: ${err.message}`);
  process.exit(2);
}

let substitutions = 0;

// Count and apply a replacement, tracking how many matches were masked.
function mask(pattern, replacement) {
  html = html.replace(pattern, function () {
    substitutions += 1;
    return replacement;
  });
}

// (1) Bearer tokens: "Bearer <token>". The token charset covers base64url and
//     JWT-ish values. Case-insensitive on the "Bearer" scheme keyword.
mask(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, REDACTED);

// (2) Labelled secret/token assignments. Match a known sensitive label, an
//     optional quoting around it, a separator (':' or '='), then the value
//     (quoted or unquoted). Only the VALUE is replaced so the label stays
//     readable in the report (e.g. `api_key: [REDACTED]`), which also keeps the
//     operation idempotent because the placeholder is not a value we re-match.
//     Labels: api[-_]?key, apikey, authorization, access[-_]?token, token, secret.
const labelGroup = '(?:api[-_]?key|apikey|authorization|access[-_]?token|token|secret)';
// label + optional surrounding quotes + separator + optional whitespace, then value.
const assignmentPattern = new RegExp(
  '("?' + labelGroup + '"?\\s*[:=]\\s*)' + // group 1: label + separator (kept)
    '(' +
    '"[^"]*"' + // a double-quoted value
    "|'[^']*'" + // or a single-quoted value
    '|[^\\s"\'<>&;]+' + // or a bare token (stop at whitespace/quote/tag/entity chars)
    ')',
  'gi'
);
html = html.replace(assignmentPattern, function (whole, keep, value) {
  // Don't re-redact an already-redacted value (idempotency).
  if (value === REDACTED || value === '"' + REDACTED + '"' || value === "'" + REDACTED + "'") {
    return whole;
  }
  substitutions += 1;
  // Preserve surrounding quotes on the value if they were present.
  if (value[0] === '"' && value[value.length - 1] === '"') {
    return keep + '"' + REDACTED + '"';
  }
  if (value[0] === "'" && value[value.length - 1] === "'") {
    return keep + "'" + REDACTED + "'";
  }
  return keep + REDACTED;
});

// (3) Email addresses.
mask(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, REDACTED);

try {
  fs.writeFileSync(outputPath, html);
} catch (err) {
  console.error(`Could not write output to ${outputPath}: ${err.message}`);
  process.exit(2);
}

console.log(`Redacted ${substitutions} sensitive match(es) from ${inputPath} -> ${outputPath}`);
