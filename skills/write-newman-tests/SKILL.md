---
name: write-newman-tests
description: >-
  Turn an approved Automate:Yes scenario into deterministic Newman/Postman
  pm.test assertions inside the collection, asserting field types and documented
  values rather than brittle full-response snapshots, and never weakening or
  skipping an assertion to get green. Use when asked to automate, script, or
  write API tests (Postman/Newman) for an endpoint, or to add pm.test/pm.expect
  assertions to postman/pokeapi.postman_collection.json.
license: Apache-2.0
compatibility: >-
  Agent- and product-agnostic. Targets this repo's Postman Collection v2.1 at
  postman/pokeapi.postman_collection.json, run by Newman (newman@6.2.3, Node
  20+). Assertions use pm.test/pm.expect (Chai) and run live against the public
  PokeAPI (https://pokeapi.co), so network access to that host is required. No
  application code exists in this repo.
metadata:
  source: AGENTS.md procedure (b) write-newman-tests
  repo: pokeapi-postman-ci
---

# write-newman-tests

Turn an `Automate: Yes` scenario (see
[generate-qa-scenarios](../generate-qa-scenarios/SKILL.md)) into assertions inside
the collection. This skill encodes the same procedure as the repo's
[AGENTS.md](../../AGENTS.md) "write-newman-tests". Follow the folder, naming, and
DRY conventions in the [API testing guide](../../docs/api-testing.md), and use the
run command documented there and in the [README](../../README.md).

This is the Postman/Newman form of test authoring: there is no browser and no UI
driver involved. The system under test is the public PokeAPI, reached only through
HTTP. Keep request volume low.

## Rules

- Write **deterministic** `pm.test` / `pm.expect` (Chai) assertions. The same
  documented input must always produce the same pass/fail result.
- **Never skip, comment out, weaken, or swallow an assertion to get green.** A
  disabled or hollowed-out assertion is worse than no assertion because it looks
  like coverage.
- **Assert field types and documented values, not brittle full-response
  snapshots.** Check that `id` is an integer and equals the documented value; do
  not pin the entire JSON body, which breaks on any unrelated additive change.
- **No strict response-time thresholds.** Do not assert "responds within N ms";
  that turns normal network variance into false failures.
- **Always use `{{base_url}}`** in request URLs; never hard-code
  `https://pokeapi.co`.
- **One clearly-labelled scenario per test block.** Give each `pm.test` a short
  lowercase outcome sentence so a failure is understandable from the name alone in
  `reports/pokeapi.junit.xml`.
- **If a scenario is impossible to express honestly** (for example, the documented
  behaviour cannot be observed through the API, or asserting it would require
  weakening another check), **stop and report it.** Do not make the test pass by
  changing what it claims to verify.
- **After writing, run the collection with Newman** using the documented command
  and **explain any failure before changing anything.** Investigate the failure
  with [investigate-failing-assertion](../investigate-failing-assertion/SKILL.md)
  rather than editing assertions reflexively.

Prefer reusing folder-level or collection-level scripts for shared checks (see the
DRY patterns in [docs/api-testing.md](../../docs/api-testing.md)) so each request
asserts only what is unique to it.
