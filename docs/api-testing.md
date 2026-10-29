# API testing guide: structured for scalable coverage

This guide explains **how to grow the API test suite** in this repository in a
consistent, repeatable way. The [README](../README.md) covers setup, how to run
the collection, where reports land, and the project's CI. Read that first. This
document picks up where the README leaves off: it gives you a convention for
expanding from the current 3 requests to a much larger suite without the tests
turning into a tangle.

The goal is **scalable coverage**: every new endpoint or behavior you want to
test has an obvious place to go, an obvious name, and a familiar assertion
pattern, so the suite stays readable as it grows and the CI command never has to
change.

## Contents

1. [What to assert: a testing taxonomy](#what-to-assert-a-testing-taxonomy)
2. [How to organize requests as the suite grows](#how-to-organize-requests-as-the-suite-grows)
3. [Keeping assertions DRY with reusable patterns](#keeping-assertions-dry-with-reusable-patterns)
4. [Managing environments and variables at scale](#managing-environments-and-variables-at-scale)
5. [Recipe: how to add a new test](#recipe-how-to-add-a-new-test)
6. [Worked example: mapping the current suite](#worked-example-mapping-the-current-suite)

---

## What to assert: a testing taxonomy

A request can be checked at several levels. As coverage grows, decide
deliberately which of these each request needs rather than copying whatever the
last one did. A good default is to assert the status code plus at least one thing
about the body shape; add field-value and header checks where they carry real
meaning.

| Assertion category | What it checks | Example for PokéAPI |
| ------------------ | -------------- | ------------------- |
| **Status code** | The request succeeded or failed as expected | `200` for an existing Pokémon, `404` for a missing one |
| **Response shape / schema** | The body has the expected structure and types | `results` is an array; each entry has a string `name` and `url` |
| **Specific field values** | Concrete values that should not change | Pikachu's `id` is `25`, `name` is `pikachu` |
| **Headers** | Metadata the client depends on | `Content-Type` includes `application/json` |
| **Negative / error cases** | The API fails cleanly for bad input | a nonexistent resource returns `404`, not `200` with empty data |
| **Pagination / list contracts** | List endpoints honor their paging rules | `?limit=5` returns exactly 5 results; `next`/`previous` links behave |

It also helps to think about **why** a test exists. Three common roles:

- **Smoke tests**: a few fast checks that the API is up and the happy path works
  (for example, "Get Pikachu" returns `200`). Run these first; if they fail, the
  rest is noise.
- **Contract tests**: verify the response shape and field types a consumer relies
  on (for example, every list result has a non-empty `name` and a valid `url`).
  These catch breaking changes even when the happy path still returns `200`.
- **Regression tests**: pin down a specific past behavior or bug so it cannot come
  back (for example, a nonexistent Pokémon must return `404`).

You do not need separate tooling for these roles. In Postman they are just
requests with different assertions, organized into folders as described next.

## How to organize requests as the suite grows

The current collection has 3 flat requests and no folders. That is fine for a
handful of requests, but it does not scale: at 30 requests a flat list is hard to
scan and the CI output is a long undifferentiated run. The convention below grows
cleanly and **does not require any change to the run command**.

### Group requests into folders by resource or concern

Postman collections can contain **folders** (nested `item` arrays in the v2.1
schema). Use them to group related requests. Two grouping strategies work well,
and you can combine them:

- **By resource**: one folder per API resource, e.g. a `pokemon` folder, an
  `ability` folder, a `type` folder.
- **By concern**: a folder for cross-cutting behaviors, e.g. an `errors` folder
  for negative cases (404s, malformed requests), or a `pagination` folder for
  list-contract tests.

A target structure for a larger suite:

```
PokéAPI CI (collection)
├─ pokemon/
│  ├─ Get Pikachu
│  ├─ Get Bulbasaur
│  └─ List first 5 Pokémon
├─ ability/
│  └─ Get ability: static
├─ pagination/
│  └─ List page 2 (offset 5)
└─ errors/
   ├─ Nonexistent Pokémon returns 404
   └─ Nonexistent ability returns 404
```

Folders are the single most important lever for scalable coverage: a new
endpoint goes into the matching folder (or a new folder), and the reader always
knows where to look.

### Naming conventions

Consistent names keep a large suite searchable and make CI output readable.

- **Requests**: name them for the behavior, not the URL. Use the form
  `<verb-ish action> <subject>[: detail]`. Good: `Get Pikachu`,
  `List first 5 Pokémon`, `Nonexistent Pokémon returns 404`. These are exactly
  the names already used in the collection, so keep following them.
- **`pm.test` names**: write a short assertion sentence describing the expected
  outcome, lowercase, no trailing period. The collection already does this:
  `status code is 200`, `id is 25`, `results array has length 5`. A reader (and
  the JUnit report) should understand a failure from the test name alone.

### How folders map to CI output

Folders are not just cosmetic. Newman's JUnit reporter records the folder path in
each test case, so grouped requests produce grouped, readable test suites in
`reports/pokeapi.junit.xml`, and the CLI text report
(`reports/pokeapi.cli.txt`) prints them under their folder headings. More
structure in the collection means more structure in the reports, which makes a
failing check faster to locate.

### This scales without changing the CI command

The local and CI run command targets the **whole collection file**:

```bash
set -o pipefail
newman run postman/pokeapi.postman_collection.json \
  --reporters cli,junit,json \
  --reporter-junit-export reports/pokeapi.junit.xml \
  --reporter-json-export reports/pokeapi.results.json \
  | tee reports/pokeapi.cli.txt
```

Newman runs every request in the file, recursing into folders automatically.
Adding folders and requests changes **what** runs but not the command, so neither
your local workflow nor `.github/workflows/postman-ci.yml` needs editing as the
suite grows.

## Keeping assertions DRY with reusable patterns

As coverage grows, copy-pasted assertions become the main maintenance cost. A
field rename or a new shared rule then means editing many requests. Keep
assertions DRY with the patterns below. They use the same `pm.test` / `pm.expect`
(Chai) style already in the collection, so new tests read like the existing ones.

### Collection-level and folder-level scripts

In Postman, both the **collection** and each **folder** can carry their own
`event` scripts with `listen: "test"` or `listen: "prerequest"`. Scripts attached
to a collection or folder run for **every request inside it**, before or after the
request's own script. This is the primary tool for shared assertions:

- Put a check that should apply to **every** request (for example, "responses
  come back reasonably fast" or "the body is valid JSON") in a **collection-level**
  test script.
- Put a check shared by one group (for example, "every `pokemon` response has a
  numeric `id`") in that **folder's** test script.

### Define a helper once, reuse it everywhere

A pre-request script at the collection level can stash helper functions on a
shared object so every request's test script can call them. Define the helper
once in the **collection-level pre-request** script:

```javascript
// Collection-level pre-request script: register shared assertion helpers once.
const helpers = {
    expectJsonOk: function (expectedStatus) {
        pm.test('status code is ' + expectedStatus, function () {
            pm.expect(pm.response.code).to.eql(expectedStatus);
        });
        pm.test('response is JSON', function () {
            pm.expect(pm.response.headers.get('Content-Type')).to.include('application/json');
        });
        return pm.response.json();
    },
    expectNamedRef: function (ref) {
        // A "named reference" is PokéAPI's common { name, url } shape.
        pm.expect(ref.name).to.be.a('string');
        pm.expect(ref.name.length).to.be.above(0);
        pm.expect(ref.url).to.be.a('string');
        pm.expect(ref.url).to.match(/^https?:\/\//);
    }
};
pm.globals.set('helpersSource', helpers.expectNamedRef.toString());
// Simplest reliable approach: keep helpers small and paste the shared snippet,
// or use a collection-level test script (below) for checks that need no args.
```

In practice the most robust reuse mechanism in Postman is a **collection-level or
folder-level test script**, because those run automatically and need no wiring.
Reach for a shared helper object only when a check needs per-request arguments.

### Assert a common response envelope once

Many APIs wrap list responses in a common envelope. PokéAPI list endpoints return
`{ count, next, previous, results }`. Instead of re-checking that shape in every
list request, assert it once in a `pagination` (or list) folder's test script:

```javascript
// Folder-level test script for list endpoints: assert the shared envelope once.
const body = pm.response.json();

pm.test('status code is 200', function () {
    pm.expect(pm.response.code).to.eql(200);
});

pm.test('list envelope has count, next, previous, results', function () {
    pm.expect(body).to.have.property('count');
    pm.expect(body).to.have.property('next');
    pm.expect(body).to.have.property('previous');
    pm.expect(body.results).to.be.an('array');
});

pm.test('each result is a valid named reference', function () {
    body.results.forEach(function (result) {
        pm.expect(result.name).to.be.a('string');
        pm.expect(result.name.length).to.be.above(0);
        pm.expect(result.url).to.be.a('string');
        pm.expect(result.url).to.match(/^https?:\/\//);
        pm.expect(result.url).to.include('/api/v2/');
    });
});
```

Each individual list request then only asserts what is **unique** to it (for
example, "this page has exactly 5 results" or "offset 5 starts at the sixth
Pokémon"). Shared rules live in one place.

## Managing environments and variables at scale

The collection already defines a **collection variable** `base_url` set to
`https://pokeapi.co` and references it as `{{base_url}}` in every request URL.
That single indirection is what lets you retarget the whole suite by editing one
value. Keep following it as you add requests: never hard-code a host.

As the suite grows you will accumulate more variables (a default `limit`, a known
resource id, etc.). Decide where each one lives:

- **Collection variables** (what this project uses): values that belong to the
  suite itself and should travel with the committed file, like `base_url`. They
  are part of `postman/pokeapi.postman_collection.json`, so they are versioned in
  Git and run identically locally and in CI. Prefer these for anything that should
  be the same everywhere.
- **Environment variables**: values that differ between contexts, such as a
  staging host versus production. Keep them in a Postman **environment** and pass
  it with `newman run ... --environment <file>`. Use environments only when a
  value genuinely changes per context; otherwise a collection variable is simpler
  and self-contained.

Reference every variable as `{{name}}` in URLs, query params, and scripts
(`pm.variables.get('name')`) so there is one source of truth per value.

### Keep secrets out

This project needs **no secrets**: it runs the committed collection directly
against the public PokéAPI, and CI references no Postman API key. Preserve that
posture as you scale:

- Never put an API key, token, or password in the collection file, in a committed
  environment, or in the workflow. The README's
  [no-secrets posture](../README.md#setup-that-still-needs-you) explains why and
  what is (and is not) needed.
- If a future endpoint ever requires a credential, inject it at run time from a CI
  secret or a local environment variable and reference it as `{{var}}`. Keep the
  value out of any tracked file; `.gitignore` already blocks common credential
  files.

## Recipe: how to add a new test

Follow this checklist every time you add coverage. Doing the same steps in the
same order is what keeps a growing suite consistent.

1. **Pick the folder.** Put the request in the folder for its resource or concern
   (for example, `pokemon` for a happy-path resource fetch, `errors` for a
   negative case). Create a new folder if none fits, following the naming
   convention above.
2. **Name the request** for its behavior, e.g. `Get ability: static` or
   `Nonexistent ability returns 404`. Do not name it after the raw URL.
3. **Use `{{base_url}}`** in the URL. For query params, fill the v2.1 `query`
   array (as the "List first 5 Pokémon" request does) rather than hard-coding them
   into the raw string only.
4. **Add assertions by taxonomy.** Start with the status code, then add shape and
   field-value checks that matter. If the request belongs to a group with a
   folder-level or collection-level script, rely on that for shared checks and
   assert only what is unique here. Name each `pm.test` as a short outcome
   sentence.
5. **Run locally** with the documented command:

   ```bash
   set -o pipefail
   newman run postman/pokeapi.postman_collection.json \
     --reporters cli,junit,json \
     --reporter-junit-export reports/pokeapi.junit.xml \
     --reporter-json-export reports/pokeapi.results.json \
     | tee reports/pokeapi.cli.txt
   ```

6. **Verify the reports.** Confirm the run passed (exit code `0`) and that your new
   request and its assertions appear in `reports/pokeapi.cli.txt` and
   `reports/pokeapi.junit.xml`, with the request and assertion totals increased by
   what you added. If an assertion fails, fix the root cause (a mis-read response
   shape or a wrong URL); never weaken or delete an assertion to force a green run.
7. **Commit** the updated collection file (and any environment file) with Git. If
   you edited in the Postman app, export back over
   `postman/pokeapi.postman_collection.json` as Collection v2.1 first, as the
   README describes. Pushing or opening a pull request reruns the same collection
   in CI.

## Worked example: mapping the current suite

The existing collection is a small instance of this structure. Today it has
**3 requests and 8 assertions, all passing** against the live PokéAPI. Mapped onto
the taxonomy and the folder convention:

| Request (current) | Suggested folder | Role | Assertions | Taxonomy categories |
| ----------------- | ---------------- | ---- | ---------- | ------------------- |
| **Get Pikachu** `GET {{base_url}}/api/v2/pokemon/pikachu/` | `pokemon` | smoke + regression | 4 | status code (`200`); field values (`id` is `25`, `name` is `pikachu`); response shape (`types` includes an `electric` entry) |
| **List first 5 Pokémon** `GET {{base_url}}/api/v2/pokemon/?limit=5&offset=0` | `pagination` | contract | 3 | status code (`200`); pagination contract (`results` length `5`); response shape (each result has a non-empty `name` and valid `url`) |
| **Nonexistent Pokémon returns 404** `GET {{base_url}}/api/v2/pokemon/this-does-not-exist-9999/` | `errors` | negative / regression | 1 | status code (`404`) |

Totals: **3 requests, 8 assertions** (4 + 3 + 1). These are currently flat in the
collection; the folder column shows where each would live once you group them. The
counts above match the live run recorded for this project, so use them as the
baseline: after you add a test, the totals in `reports/pokeapi.results.json` should
grow by exactly what you added.

---

## Seeing results and trends in CI

The CI workflow does more than pass or fail: it surfaces each run's results in
the GitHub Actions UI and tracks key metrics over time so you can spot patterns.

### Per-run report (every run)

After the collection runs, [`dorny/test-reporter`](https://github.com/dorny/test-reporter)
parses `reports/pokeapi.junit.xml` and publishes a **"PokéAPI test results"**
check on the run. Open any run (or the **Checks** tab of a pull request) to see
pass/fail per request and per assertion, grouped by folder, without downloading
the artifact. Failing runs still publish the report (`fail-on-error: false`), so
a red run shows exactly which assertion broke.

Each run also writes a summary table to the **run page** (via
`$GITHUB_STEP_SUMMARY`): result, assertions passed/failed, requests failed, and
average response time.

### Full HTML report on the Pages site (pushes to `main`)

On pushes to `main`, the run also produces a rich, standalone HTML report with
[`newman-reporter-htmlextra`](https://github.com/DannyDainton/newman-reporter-htmlextra)
and publishes the public site via the **official GitHub Pages deployment**
(`actions/deploy-pages`). The bare Pages URL shows the **latest run's** detailed
results — every request, its response, and each assertion:

- **Latest report:** `https://<owner>.github.io/<repo>/`
- **Trend chart (history):** `https://<owner>.github.io/<repo>/trend/`

**Why a deploy job, not a branch push.** GitHub Pages' branch-publishing mode
does *not* rebuild when the commit is pushed by a workflow using the default
`GITHUB_TOKEN`
([documented here](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site#troubleshooting-publishing-from-a-branch)).
So the repo's Pages build type is set to **GitHub Actions** (`build_type:
workflow`), and a dedicated `deploy-pages` job assembles and deploys the site:

- `/` ← the latest htmlextra report (`index.html`)
- `/trend/` ← the chart + history, read from the `gh-pages` branch

The `gh-pages` branch is still the **data store** for the trend history (the
benchmark action keeps appending points there), but Pages no longer *serves*
from it — the deploy job reads `gh-pages/trend/` and bundles it with the fresh
report into one Pages artifact. Deployment is gated to `main` pushes, runs after
the collection job so the newest trend point is included, and uses `if: always()`
so a failing run still publishes its (red) report.

### Trend over time (pushes to `main`)

On every push to `main`, the workflow extracts three metrics from the Newman JSON
report and appends them to a time series using
[`benchmark-action/github-action-benchmark`](https://github.com/benchmark-action/github-action-benchmark):

- **Failed assertions** (count) — should stay at `0`
- **Failed requests** (count) — should stay at `0`
- **Avg response time** (ms) — PokéAPI latency, useful for spotting slowdowns

The data and an interactive chart are committed to the **`gh-pages` branch** under
`trend/`, which the `deploy-pages` job then serves at
`https://<owner>.github.io/<repo>/trend/` (see the deployment note above). The
series only updates on `main` pushes, so pull requests and feature branches never
pollute the published trend.

An **alert threshold** of `200%` flags any run where a metric regresses sharply
versus the previous point — for example a new assertion failure, or response time
more than doubling. Alerts post a commit comment but do **not** fail the build
(`fail-on-alert: false`), so an upstream PokéAPI slowdown is visible without
breaking your pipeline.

> **What the trend actually tells you.** The suite asserts deterministic values
> against the live public PokéAPI, so the failure-count lines should sit flat at
> zero. Early movement in the chart will almost always be the **response-time**
> line reacting to PokéAPI's own latency or a network blip in the runner, not a
> regression in your tests. Read a spike as "the upstream API or the runner was
> slow then", and treat any non-zero failure count as the real signal to
> investigate.

### The metrics script

The extraction lives in [`scripts/newman-trend-metrics.js`](../scripts/newman-trend-metrics.js).
It reads `run.stats` and `run.timings` from the Newman JSON report, writes the
job-summary table, and emits `reports/trend-metrics.json` in the
`customSmallerIsBetter` format the benchmark action expects (all three metrics
are framed so that lower is better). To change what the trend tracks, edit the
`metrics` array in that script.
