---
name: triage-flaky-run
description: >-
  Triage a Newman run that fails intermittently or for a non-product reason by
  classifying it as network failure, service availability, incorrect assertion,
  or API defect, then proposing a root cause with evidence for a human to confirm
  by reproducing. Forbids blanket retries and longer or fixed timeouts that paper
  over flakiness. Use when a run passes sometimes and fails sometimes, or when a
  failure may be environmental rather than a real regression.
license: Apache-2.0
compatibility: >-
  Agent- and product-agnostic. Targets this repo's Postman Collection v2.1 at
  postman/pokeapi.postman_collection.json, run by Newman (newman@6.2.3, Node
  20+). Reads reports/pokeapi.cli.txt and reports/pokeapi.junit.xml. The system
  under test is the public PokeAPI (https://pokeapi.co); network access to that
  host is needed to reproduce and confirm. No application code exists in this
  repo.
metadata:
  source: AGENTS.md procedure (d) triage-flaky-run
  repo: pokeapi-postman-ci
---

# triage-flaky-run

Use this when a run fails but you suspect the cause is not a stable product
behaviour. Compare the failed run against a known-good run and classify the
failure into one of the four categories below. This is **human-in-the-loop**: you
propose a root cause; the human confirms by reproducing. It encodes the same
procedure as the repo's [AGENTS.md](../../AGENTS.md) "triage-flaky-run"; for how to
read the reports, see the [troubleshooting guide](../../docs/troubleshooting.md).

There is no application code in this repo. The system under test is the public
PokeAPI, so you never "fix" the API. Keep request volume low.

## Classification

- **Network failure** - errors like `ECONNREFUSED`, `ENOTFOUND`, DNS failures, or
  TLS errors, with **no HTTP status code** in the report. The request never
  reached PokeAPI. Root cause is local/network, not the test.
- **Service availability** - a `502`/`503` or a request timeout coming back
  **from pokeapi.co**. The service answered but was unhealthy. Re-run later and
  keep request volume low.
- **Incorrect assertion** - a manual `GET` shows the response **is** the
  documented behaviour, so the assertion itself is wrong. Fix the test to match
  the docs via [investigate-failing-assertion](../investigate-failing-assertion/SKILL.md),
  with a one-line reason.
- **API defect** - the response contradicts the documented behaviour. Do **not**
  touch the test; raise it with evidence via
  [investigate-failing-assertion](../investigate-failing-assertion/SKILL.md).

## Rules

- **No blanket retries.** Retrying everything to get green hides real failures.
- **No longer or fixed timeouts** to paper over flakiness; that masks service and
  network problems instead of surfacing them.
- **Propose the root cause and the evidence; the human confirms by reproducing.**
- If the failure shows wrong data or behaviour relative to the docs, treat it as a
  possible **API defect** and do not touch the test.
