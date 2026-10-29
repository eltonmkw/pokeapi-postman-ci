---
name: investigate-failing-assertion
description: >-
  Investigate a failing Newman/Postman assertion and decide what, if anything, to
  change, using a human-in-the-loop classification of intentional documented API
  change versus suspected API defect. Only fixes the test when documented
  behaviour genuinely changed, keeps assertions as strong as before, and never
  loosens an assertion to get green. Use when a test or assertion fails and you
  are given the error, the cli.txt summary, or the JUnit report.
license: Apache-2.0
compatibility: >-
  Agent- and product-agnostic. Targets this repo's Postman Collection v2.1 at
  postman/pokeapi.postman_collection.json, run by Newman (newman@6.2.3, Node
  20+). Reads reports/pokeapi.cli.txt and reports/pokeapi.junit.xml. The system
  under test is the public PokeAPI (https://pokeapi.co); network access to that
  host is needed to confirm documented behaviour. No application code exists in
  this repo.
metadata:
  source: AGENTS.md procedure (c) investigate-failing-assertion
  repo: pokeapi-postman-ci
---

# investigate-failing-assertion

Use this when a specific assertion fails and you must decide what, if anything, to
change. This is **human-in-the-loop**: you classify and propose; a human confirms.
It encodes the same procedure as the repo's [AGENTS.md](../../AGENTS.md)
"investigate-failing-assertion". For exactly how to locate a failure in the
reports, read the [troubleshooting guide](../../docs/troubleshooting.md).

There is **no application code** in this repo. The system under test is the public
PokeAPI, so you never "fix" the API; your only levers are the test and the
evidence you raise.

## Steps

1. **Read the failure first.** Open `reports/pokeapi.cli.txt` for the summary and
   find the failing testcase in `reports/pokeapi.junit.xml` (the testcase name
   plus its `<failure>` message). See the
   [troubleshooting guide](../../docs/troubleshooting.md) for exactly how to
   locate it.
2. **Classify before touching any test.** Decide between two explanations:
   - **Intentional, documented API change**: the official
     [PokeAPI docs](https://pokeapi.co/docs/v2) now describe the new behaviour,
     and a manual `GET` confirms the response matches the new docs.
   - **Suspected API defect**: the response contradicts the documented behaviour.
3. **Only fix the test when documented behaviour genuinely changed.** Make the
   minimal edit to match the new documented value or shape, keep the assertion as
   strong as before (same type/value rigour, no loosening), and record a one-line
   reason for the change.
4. **Never edit "the API".** There is no application code in this repo, so never
   attempt to fix PokeAPI. Your only levers are the test and the evidence you
   raise.
5. **Raise suspected API defects with evidence**, not by weakening tests. Attach
   the failing assertion message and the actual response body. Leave the assertion
   as-is so the red status keeps signalling the problem.
6. **Never remove or loosen an assertion to get green.** Keep the fix minimal and
   assertions unchanged except for the deliberate, documented update in step 3.

If the failure looks intermittent or environmental rather than a stable product
behaviour, triage it first with
[triage-flaky-run](../triage-flaky-run/SKILL.md).
