# AGENTS.md: API QA playbook for pokeapi-postman-ci

This file is a reusable, process-focused playbook for doing API quality
assurance in this repository with Postman and Newman. It adapts four QA skills
(scenario generation, test writing, failure investigation, and flaky-run triage)
to this project's one tested artifact: the Postman Collection v2.1 at
`postman/pokeapi.postman_collection.json`, which exercises the public
[PokéAPI](https://pokeapi.co) and is run by Newman locally and in CI.

Scope notes:

- This playbook is about **decisions and procedure**, not setup. For installing
  the runner, the exact run command, report locations, and CI behaviour, read the
  [README](README.md). For the folder convention, naming, assertion taxonomy, and
  DRY patterns, read the [API testing guide](docs/api-testing.md). For diagnosing
  a red run, read the [troubleshooting guide](docs/troubleshooting.md).
- There is **no application code** in this repo. The system under test is the
  public PokéAPI. You never "fix" the API; you fix tests only when the API's
  documented behaviour genuinely changed, and you raise suspected API defects with
  evidence.
- Keep request volume low. The collection makes a handful of calls on purpose.

## The run command and report paths

Every procedure below refers to this single run command (identical locally and in
CI). Run it from the repo root:

```bash
set -o pipefail
newman run postman/pokeapi.postman_collection.json \
  --reporters cli,junit,json \
  --reporter-junit-export reports/pokeapi.junit.xml \
  --reporter-json-export reports/pokeapi.results.json \
  | tee reports/pokeapi.cli.txt
```

It writes three reports (all gitignored, regenerated every run):

- `reports/pokeapi.cli.txt` - human-readable pass/fail summary.
- `reports/pokeapi.junit.xml` - per-test-case results with failure messages.
- `reports/pokeapi.results.json` - full structured run data.

The collection is organised into three folders, following
[docs/api-testing.md](docs/api-testing.md): `pokemon`, `pagination`, and
`errors`. Request names are behaviour-based (for example `Get Pikachu`) and
`pm.test` names are short lowercase outcome sentences with no trailing period.

## How this playbook relates to the Kiro hook

This playbook **complements** the existing Kiro hook at
`.kiro/hooks/pokeapi-postman-tests.json`, which auto-runs Newman whenever you save
a file under `postman/**` or the CI workflow YAML. The two serve different
purposes and do not replace each other:

- The **hook** gives fast, automatic local feedback: save, and the collection runs
  so you see a red or green result immediately.
- **This playbook** gives the reusable decision procedures: what scenarios to
  write, how to write assertions that stay deterministic, and how to investigate a
  failure or a flaky run without weakening the suite.

Use the hook to notice a failure quickly; use the procedures below to decide what
to do about it.

---

## Procedure (a): generate-api-scenarios

Use this to turn an endpoint or a requirement into a reviewed set of test
scenarios before writing any assertions.

Rules:

- **No unit-level or internal tests.** Those belong to the API's own developers.
  Here you test observable HTTP behaviour (status, body shape, documented field
  values and relationships) only.
- **Every scenario gets an owner**, either `QA` or `Dev`. QA owns behaviour and
  contract scenarios; Dev owns anything that would require changing the service
  itself (which, for this repo, means raising it upstream, not editing code here).
- **Every scenario gets an Automate decision** (`Yes` or `No`) with a one-line
  reason, for example "stable, high value", "regression guard", or
  "one-off manual check, not worth automating".
- **Avoid overlapping scenarios.** If two scenarios assert the same behaviour,
  merge them into one.
- **Cover the happy path, the main error cases, and edge cases** drawn from the
  acceptance criteria or the documented contract.
- **Do not invent features.** Only test behaviour that the official
  [PokéAPI documentation](https://pokeapi.co/docs/v2) actually documents.

Output a table in exactly this column format:

```
Title | Expected behaviour/source | Priority | Automate | Reason
```

Priority is `High`, `Med`, or `Low`. After the table, write the concrete steps and
assertions for each scenario marked `Automate: Yes`.

### Worked example (PokéAPI)

| Title | Expected behaviour/source | Priority | Automate | Reason |
| ----- | ------------------------- | -------- | -------- | ------ |
| Get a known valid Pokémon | `GET /api/v2/pokemon/pikachu/` returns `200` with `id` `25` and `name` `pikachu` (PokéAPI Pokemon endpoint docs) | High | Yes | Core happy path, stable documented values, high value |
| Nonexistent resource returns 404 | `GET /api/v2/pokemon/<missing>/` returns `404` (PokéAPI returns Not Found for unknown resources) | High | Yes | Negative-case regression guard, cheap and stable |
| Important fields have documented types | On the Pikachu payload, `id`/`base_experience`/`height`/`weight` are integers, `name` is a string, `is_default` is a boolean, `types` is an array (PokéAPI Pokemon type table) | High | Yes | Contract check catches breaking shape changes the status code would miss |
| Types list is a well-formed relationship | On the Pikachu payload, each `types[]` entry has an integer `slot` (1-based, contiguous, unique) and a named reference `type` whose `url` includes `/api/v2/type/` (PokéAPI PokemonType: slot + NamedAPIResource) | Med | Yes | Meaningful invariant on a documented relationship, stable |
| List endpoint honours its envelope | `GET /api/v2/pokemon/?limit=5&offset=0` returns `200`, `count` integer, `next`/`previous` present, `results` an array of length 5 (PokéAPI paginated list contract) | Med | Yes | Pagination contract, stable and repeatable |

All five are owned by `QA` (observable contract behaviour). Each already maps to a
folder: happy path and field/relationship scenarios live in `pokemon`, the list
scenario in `pagination`, the 404 in `errors`. Scenarios that only need a one-time
manual confirmation (for example, eyeballing a new endpoint's shape before
deciding what to assert) are `Owner: QA`, `Automate: No` with the reason
"exploratory, not a regression".

---

## Procedure (b): write-newman-tests

Use this to turn an `Automate: Yes` scenario into assertions inside the
collection. Follow the folder and naming conventions in
[docs/api-testing.md](docs/api-testing.md).

Rules:

- Write **deterministic** `pm.test` / `pm.expect` (Chai) assertions. The same
  documented input must always produce the same pass/fail result.
- **Never skip, comment out, weaken, or swallow an assertion to get green.** A
  disabled or hollowed-out assertion is worse than no assertion because it looks
  like coverage.
- **Assert field types and documented values, not brittle full-response
  snapshots.** Check that `id` is an integer and equals the documented value;
  do not pin the entire JSON body, which breaks on any unrelated additive change.
- **No strict response-time thresholds.** Do not assert "responds within N ms";
  that turns normal network variance into false failures.
- **Always use `{{base_url}}`** in request URLs; never hard-code `https://pokeapi.co`.
- **One clearly-labelled scenario per test block.** Give each `pm.test` a short
  lowercase outcome sentence so a failure is understandable from the name alone in
  `reports/pokeapi.junit.xml`.
- **If a scenario is impossible to express honestly** (for example, the documented
  behaviour cannot be observed through the API, or asserting it would require
  weakening another check), **stop and report it.** Do not make the test pass by
  changing what it claims to verify.
- **After writing, run the collection with Newman** using the command above and
  **explain any failure before changing anything.** Investigate the failure
  (procedure c) rather than editing assertions reflexively.

Prefer reusing folder-level or collection-level scripts for shared checks (see the
DRY patterns in [docs/api-testing.md](docs/api-testing.md)) so each request
asserts only what is unique to it.

---

## Procedure (c): investigate-failing-assertion

Use this when a specific assertion fails and you must decide what, if anything, to
change. This is **human-in-the-loop**: you classify and propose; a human confirms.

1. **Read the failure first.** Open `reports/pokeapi.cli.txt` for the summary and
   find the failing testcase in `reports/pokeapi.junit.xml` (the testcase name
   plus its `<failure>` message). See the
   [troubleshooting guide](docs/troubleshooting.md) for exactly how to locate it.
2. **Classify before touching any test.** Decide between two explanations:
   - **Intentional, documented API change**: the official
     [PokéAPI docs](https://pokeapi.co/docs/v2) now describe the new behaviour,
     and a manual `GET` confirms the response matches the new docs.
   - **Suspected API defect**: the response contradicts the documented behaviour.
3. **Only fix the test when documented behaviour genuinely changed.** Make the
   minimal edit to match the new documented value or shape, keep the assertion as
   strong as before (same type/value rigour, no loosening), and record a one-line
   reason for the change.
4. **Never edit "the API".** There is no application code in this repo, so never
   attempt to fix PokéAPI. Your only levers are the test and the evidence you
   raise.
5. **Raise suspected API defects with evidence**, not by weakening tests. Attach
   the failing assertion message and the actual response body. Leave the assertion
   as-is so the red status keeps signalling the problem.
6. **Never remove or loosen an assertion to get green.** Keep the fix minimal and
   assertions unchanged except for the deliberate, documented update in step 3.

---

## Procedure (d): triage-flaky-run

Use this when a run fails but you suspect the cause is not a stable product
behaviour. Compare the failed run against a known-good run and classify the
failure into one of the four categories below. This is also human-in-the-loop:
you propose a root cause; the human confirms by reproducing.

- **Network failure** - errors like `ECONNREFUSED`, `ENOTFOUND`, DNS failures, or
  TLS errors, with **no HTTP status code** in the report. The request never
  reached PokéAPI. Root cause is local/network, not the test.
- **Service availability** - a `502`/`503` or a request timeout coming back
  **from pokeapi.co**. The service answered but was unhealthy. Re-run later and
  keep request volume low.
- **Incorrect assertion** - a manual `GET` shows the response **is** the
  documented behaviour, so the assertion itself is wrong. Fix the test to match the
  docs (via procedure c), with a one-line reason.
- **API defect** - the response contradicts the documented behaviour. Do **not**
  touch the test; raise it with evidence (procedure c).

Rules:

- **No blanket retries.** Retrying everything to get green hides real failures.
- **No longer or fixed timeouts** to paper over flakiness; that masks service and
  network problems instead of surfacing them.
- **Propose the root cause and the evidence; the human confirms by reproducing.**
- If the failure shows wrong data or behaviour relative to the docs, treat it as a
  possible **API defect** and do not touch the test.
