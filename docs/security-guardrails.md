# Security guardrails: keeping secrets and PII out of the public report

This repo publishes the latest Newman htmlextra report as the public GitHub Pages
site (`index.html`). Because that page is world-readable, a credential or personal
detail that reached the report would be exposed. These layered, defense-in-depth
guards make that leak path hard to hit. For the run command and report paths see
the [README](../README.md); for the QA invariants see the
[AGENTS.md playbook](../AGENTS.md).

The collection is designed to talk only to the public, unauthenticated
[PokéAPI](https://pokeapi.co), so in normal operation there is nothing sensitive
to leak. The guards exist so that stays true even if someone later adds auth, a
header, or an off-host request by mistake.

## The layers

- **Layer 1 - secret scan (CI + local).** `gitleaks` runs as a dedicated
  `secret-scan` job in CI (full history, `fetch-depth: 0`) and as a pre-commit
  hook locally. A detected secret fails the workflow / blocks the commit.
- **Layer 2 - pre-commit framework.** `.pre-commit-config.yaml` wires gitleaks
  and the no-auth linter to run on `git commit` (`pre-commit install` to enable),
  so problems are caught before they are committed.
- **Layer 4 - collection no-auth lint.** `scripts/check-collection-no-auth.js`
  fails if the collection gains an auth block, an `Authorization` / `x-api-key`
  header, or any host other than `pokeapi.co`. It runs as a hard CI gate (the
  `collection-no-auth` job) and as a Kiro save-hook and pre-commit hook.
- **Layer 5 - publish-time redaction.** `scripts/redact-report.js` masks bearer
  tokens, api-key / authorization / token / secret assignments, and email
  addresses to `[REDACTED]` as the downloaded report is turned into
  `site/index.html` in the `deploy-pages` job. This is the last backstop before
  the report goes public.

(There is no "Layer 3" in this list; the numbering is kept consistent with the
approved guardrails spec, which reserved it for a control not adopted here.)

## Layer 6 (opt-in): htmlextra sensitive-data flags

Newman's htmlextra reporter can omit request/response bodies and headers from the
generated report via flags such as `--reporter-htmlextra-skipSensitiveData` (and
the related body/header omission flags). Enabling them would strip the richest,
most useful part of the report -- the actual request/response detail QA relies on
to investigate failures -- so it is **left OFF by default**. The Newman "Run
collection" command in CI is unchanged.

It is available as an **opt-in**: if you decide the privacy benefit outweighs the
loss of report detail, you can add the htmlextra sensitive-data / body-omission
flags to the Newman invocation yourself. Tradeoff to weigh before doing so:

- **Benefit:** request/response bodies and headers never appear in the published
  report at all, a blunt guarantee on top of Layer 5's targeted redaction.
- **Cost:** the published report loses the per-request body/header detail that
  makes it useful for triaging a failing assertion, which largely defeats the
  reason the htmlextra report is published in the first place.

Because htmlextra cannot be installed or run in the offline build sandbox, the
effect of these flags on this specific report could not be verified here, which is
the other reason Layer 6 is documented as an opt-in rather than enabled silently.
Layers 1, 2, 4, and 5 already keep the report clean for the unauthenticated
collection, so Layer 6 is only worth enabling if the collection's threat model
changes.
