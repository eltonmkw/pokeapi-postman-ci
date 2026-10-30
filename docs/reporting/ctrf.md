# CTRF GitHub Test Reporter

**Reporter:** CTRF (Common Test Report Format) via
[`ctrf-io/github-test-reporter`](https://github.com/ctrf-io/github-test-reporter).

**Purpose:** turn the Newman run into a standardized CTRF JSON report and publish
GitHub-native test summaries — pass/fail counts, failed-test details, and (over
time) fail-rate and flaky-rate insights — directly in the Actions **Job Summary**,
a **status check**, and a **pull-request comment**.

This is one of several independent reporters in this repo. It lives entirely in
its own workflow (`.github/workflows/ctrf-report.yml`) and its own output
directory (`reports/ctrf/`); it does not touch the `postman-ci.yml` workflow, the
GitHub Pages site, the trend history, or any other reporter's files.

## How it works

```
Newman run ──(newman-reporter-ctrf-json)──► reports/ctrf/pokeapi.ctrf.json (CTRF JSON)
                                                      │
                                   ctrf-io/github-test-reporter@v1.3.2
                                                      │
              ┌───────────────────────┬──────────────┴───────────────┐
         Job Summary             Status check                 PR comment
         (pass/fail,            ("CTRF test results")      (same report, updated
          fail/flaky rate)                                   in place per PR)
                                                      │
                                      Artifacts: raw CTRF JSON + CLI log
```

`newman-reporter-ctrf-json` is a Newman reporter plugin. Adding `ctrf-json` to
`--reporters` makes Newman emit a CTRF-compliant JSON file alongside the normal
CLI output. The GitHub action then reads that JSON and renders the reports.

## Installation / dependencies

No `package.json` is used in this repo — Newman and its reporters are installed
globally, matching the existing convention. Pinned versions:

- `newman@6.2.3`
- `newman-reporter-ctrf-json@0.2.0`
- GitHub action `ctrf-io/github-test-reporter` pinned to commit
  `dbb08957b5b2af918b39136ab2c5532002c7649b` (tag `v1.3.2`).

## Local execution

From the repo root:

```bash
npm install -g newman@6.2.3 newman-reporter-ctrf-json@0.2.0

mkdir -p reports/ctrf
set -o pipefail
newman run postman/pokeapi.postman_collection.json \
  --reporters cli,ctrf-json \
  --reporter-ctrf-json-output-dir reports/ctrf \
  --reporter-ctrf-json-output-file pokeapi.ctrf.json \
  --reporter-ctrf-json-test-type api \
  --reporter-ctrf-json-app-name pokeapi-postman-ci \
  | tee reports/ctrf/pokeapi.ctrf.cli.txt
```

`set -o pipefail` ensures a failed assertion returns Newman's non-zero exit code
even though stdout is piped through `tee`. The CTRF JSON is written to
`reports/ctrf/pokeapi.ctrf.json` (gitignored).

Inspect it:

```bash
node -e "const r=require('./reports/ctrf/pokeapi.ctrf.json'); console.log(r.results.summary)"
```

CTRF JSON shape (abridged):

```json
{
  "results": {
    "tool": { "name": "newman" },
    "summary": { "tests": 58, "passed": 58, "failed": 0, "pending": 0, "skipped": 0, "other": 0, "start": 0, "stop": 0 },
    "tests": [
      { "name": "Get Pikachu: status code is 200", "status": "passed", "duration": 54, "suite": ["PokéAPI CI", "pokemon"], "type": "api" }
    ],
    "environment": { "appName": "pokeapi-postman-ci" }
  }
}
```

Failed assertions appear as a test with `"status": "failed"` plus `message` and
`trace` fields, e.g. `"message": "expected 1 to deeply equal 2"`.

## GitHub Actions integration

Workflow: `.github/workflows/ctrf-report.yml`.

- **Triggers:** `push` to `main`, `pull_request` into `main`, and
  `workflow_dispatch` (manual). No schedule, to avoid extra load on the public
  PokéAPI (the scheduled drift check lives in `postman-ci.yml`).
- **Install:** `npm install -g` (no `npm ci`, because there is no lockfile; see
  Limitations).
- **Run:** a dedicated Newman run that emits only the CTRF JSON into
  `reports/ctrf/`, with `set -o pipefail` so assertion failures fail the job.
- **Publish:** `ctrf-io/github-test-reporter` with `if: always()` so results are
  published even when tests fail. `exit-on-empty` / `exit-on-no-files` make a
  missing or empty report fail the step (catches a broken reporter).
  `exit-on-fail` is deliberately left `false` so this step is not a second gate —
  the authoritative pass/fail is the "Run collection" step.
- **Artifacts:** the raw CTRF JSON + CLI log (`pokeapi-ctrf-report`) and the
  action's processed report (`pokeapi-ctrf-processed`).

### Where to view / download the report

- **Job Summary:** open the workflow run → the CTRF summary (and fail/flaky-rate
  tables once history exists) renders on the run page.
- **Status check:** a check named **"CTRF test results"** on the commit/PR.
- **Pull request comment:** on PRs into `main`, a comment tagged
  `ctrf-CTRF Report` is posted and updated in place on each run.
- **Download:** the run's **Artifacts** section → `pokeapi-ctrf-report`
  (raw JSON) or `pokeapi-ctrf-processed`.

### Required GitHub secrets / settings

- **No new secrets.** The action uses the built-in `GITHUB_TOKEN`.
- The workflow requests minimal permissions: `contents: read`, `checks: write`
  (status check), `pull-requests: write` (PR comment).
- **Forked PRs:** `GITHUB_TOKEN` is read-only for pull requests from forks, so the
  status-check and PR-comment writes are skipped by GitHub for fork PRs. The job
  summary and artifact still work. This repo's current flow is same-repo
  branches, so this is not an issue here.

## Troubleshooting

- **"No test reports found" / step fails on empty report:** the Newman run didn't
  write `reports/ctrf/pokeapi.ctrf.json`. Check the "Run collection" step log;
  confirm the `ctrf-json` reporter is installed. `exit-on-no-files`/`exit-on-empty`
  intentionally fail the publish step so this doesn't pass silently.
- **No fail-rate / flaky-rate numbers:** these build from previous runs. The first
  run(s) show none; history accrues via `fetch-previous-results` + `GITHUB_TOKEN`.
- **No PR comment:** only posted on `pull_request` events with
  `pull-requests: write`; skipped for forked PRs (read-only token).
- **Tests pass locally but the CLI shows more than described in the README:** the
  committed collection has grown beyond the three requests the top-level README
  mentions; the CTRF report reflects the actual collection.

## Limitations

- **No `npm ci`.** The repo has no `package.json`/lockfile, so the task's
  "`npm ci`" step is not applicable; this reporter follows the repo's existing
  global-install pattern instead.
- **Separate Newman run.** To stay fully isolated and independently removable,
  this workflow runs its own Newman execution (CTRF-only reporter) rather than
  sharing `postman-ci.yml`'s run. That is a small amount of duplicate API traffic
  (a handful of requests) in exchange for clean separation.
- **Insights need history.** Flaky/fail-rate analytics are only meaningful after
  several runs have accumulated.
- **CI validation is unverified here.** The report generation, exit codes, and
  CTRF structure were validated locally. The GitHub-side rendering (job summary,
  status check, PR comment, cross-run insights) requires an actual Actions run.

## How to disable or remove

- **Disable temporarily:** in GitHub → Actions → "CTRF Report" workflow →
  "Disable workflow". Or comment out the `on:` triggers.
- **Remove completely:** delete `.github/workflows/ctrf-report.yml` and this
  `docs/reporting/ctrf.md`. Nothing else in the repo depends on CTRF — no shared
  files, no `postman-ci.yml` edits, no committed reports (`reports/ctrf/` is
  gitignored).

---

## SDET learning notes

- **Why this architecture:** CTRF is a *framework-agnostic* report schema. Instead
  of coupling the CI to one tool's report shape, Newman emits a standard JSON that
  a generic reporter action understands. The same action would work unchanged for
  Jest, Playwright, etc. — the value is a stable contract between "thing that
  runs tests" and "thing that reports tests".
- **How Newman output reaches the tool:** a Newman *reporter plugin*
  (`newman-reporter-ctrf-json`) hooks into Newman's run events and serializes them
  into CTRF JSON on disk. The GitHub action is a separate process that reads that
  file — the handoff is just a file path (`report-path`), not an API.
- **How GitHub Actions handles failed API tests:** the failure must propagate as a
  non-zero *process exit code*. `newman run` exits non-zero on any failed
  assertion; `set -o pipefail` preserves that code through the `tee` pipe. The
  reporting step runs with `if: always()` so it still publishes on red — but it is
  a *separate* step, so it cannot mask the test step's failure. Separating "run"
  from "report" is the key pattern: reporting must never be able to turn a red run
  green.
- **Capabilities gained:** standardized results, a readable job summary, a status
  check, auto-updating PR comments, and multi-run fail/flaky insights — with no
  external service and no secrets.
- **Limitations that remain:** insights need accumulated history; forked PRs can't
  write checks/comments; and there's still a second Newman run (the cost of strict
  isolation).
- **Concepts worth studying next:** CI exit-code propagation and
  `pipefail`; `if: always()` vs job-level `needs`/`if`; least-privilege
  `permissions` and the forked-PR token model; SHA-pinning actions for supply-chain
  safety; and open reporting standards (CTRF) vs tool-specific formats (JUnit).
