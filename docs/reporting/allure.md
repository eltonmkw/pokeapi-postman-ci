# Allure Report reporter

This guide covers the [Allure Report](https://allurereport.org/) integration for
this repository: what it is, how it is installed and configured, how to run it
locally, how it is wired into GitHub Actions, where to view the report, and how
to disable or remove it. It also documents the GitHub Pages coexistence strategy
and some SDET learning notes.

## Name and purpose

**Allure Report** is an open-source, multi-language test reporting framework. The
Newman integration used here is
[`newman-reporter-allure`](https://github.com/allure-framework/allure-js), and the
HTML report is produced by the
[`allure-commandline`](https://www.npmjs.com/package/allure-commandline) CLI. Both
are maintained by **Qameta Software**, the official Allure team (Apache-2.0).

Its purpose in this repo is to turn the existing single Newman run into a rich,
**browsable** HTML report: per-request/per-assertion results with status,
durations, request/response attachments, and a graphical overview. It complements
the existing reporters (cli, junit, json, htmlextra) rather than replacing any of
them: Allure gives a deeper interactive drill-down than the flat htmlextra page.

## Installation and configuration

The repository deliberately has **no `package.json` or lockfile**: Newman and its
reporters are installed **globally**, exactly as the CI workflow already does for
`newman` and `newman-reporter-htmlextra`. The Allure tooling follows that same
pattern so this reporter stays independently add/removable and consistent with the
rest of the project.

Pinned versions:

| Package | Version | Role |
| --- | --- | --- |
| `newman-reporter-allure` | `2.15.1` | Newman reporter that writes Allure **results** (the Allure 2 line) |
| `allure-commandline` | `2.46.1` | Allure 2 CLI that turns results into the **HTML report** |

The Allure **2** line is chosen on purpose: the `2.15.1` reporter pairs with the
mature `allure-commandline` 2.x report generator and the established Allure 2
tooling/actions ecosystem. (The Allure 3 line exists — `newman-reporter-allure`
3.x — but is intentionally not adopted here to keep a single, well-understood
report format.)

Install globally (mirrors the CI install step):

```bash
npm install -g newman@6.2.3 newman-reporter-htmlextra@1.23.1 \
  newman-reporter-allure@2.15.1 allure-commandline@2.46.1
```

Verify:

```bash
allure --version   # prints a 2.x version, e.g. 2.46.1
```

### Trade-off vs. a lockfile

Global installs mean versions are pinned by the install command, not by a
committed `package-lock.json`, so there is no byte-for-byte dependency lock. This
matches how every other reporter in this repo is already managed and keeps the
change isolated to one reporter. A future maintainer who wants reproducible,
locked dependencies for **all** reporters could introduce a minimal `package.json`
+ lockfile and switch CI to `npm ci` — that is a deliberate cross-cutting change
and is out of scope here.

## Run it locally

Allure works in two phases: Newman writes raw **results**, then the Allure CLI
**generates** the HTML report from them.

```bash
mkdir -p reports

# 1) Run the collection and emit Allure results.
set -o pipefail
newman run postman/pokeapi.postman_collection.json \
  --reporters cli,allure \
  --reporter-allure-export reports/allure/results \
  | tee reports/pokeapi.cli.txt

# 2) Generate the browsable HTML report from those results.
allure generate reports/allure/results --clean -o reports/allure/report

# 3) Open it in a browser (starts a tiny local server; needs Java).
allure open reports/allure/report
```

You can also run Allure alongside every other reporter in a single run, which is
exactly what CI does:

```bash
set -o pipefail
newman run postman/pokeapi.postman_collection.json \
  --reporters cli,junit,json,htmlextra,allure \
  --reporter-junit-export reports/pokeapi.junit.xml \
  --reporter-json-export reports/pokeapi.results.json \
  --reporter-htmlextra-export reports/pokeapi.report.html \
  --reporter-allure-export reports/allure/results \
  | tee reports/pokeapi.cli.txt
allure generate reports/allure/results --clean -o reports/allure/report
```

> **Important — the correct flag is `--reporter-allure-export`.** With
> `newman-reporter-allure@2.15.1`, the results directory is set with
> **`--reporter-allure-export <dir>`**. The flag `--reporter-allure-resultsDir`
> that some older docs mention is **silently ignored** by this version: it does
> not error, it just writes results to a default `./allure-results` directory in
> the current working directory instead of where you asked. Always pass
> `--reporter-allure-export reports/allure/results` so results land under
> `reports/` (which is gitignored).

All generated output stays under `reports/`, which `.gitignore` already excludes
(`/reports/*` with `!/reports/.gitkeep`), so nothing Allure produces is committed.

## GitHub Actions integration

Allure is wired into the **same single Newman run** in
[`.github/workflows/postman-ci.yml`](../../.github/workflows/postman-ci.yml). The
collection is executed exactly once; `allure` is just another entry in the shared
`--reporters` list, so no extra API traffic is generated.

What was added:

1. **Install step (`Install Newman (pinned)`)** — appended
   `newman-reporter-allure@2.15.1 allure-commandline@2.46.1` to the existing
   global `npm install -g` (htmlextra kept).
2. **Run step (`Run collection`)** — added `allure` to the `--reporters` list
   (now `cli,junit,json,htmlextra,allure`) and added
   `--reporter-allure-export reports/allure/results`. The `set -o pipefail`, the
   existing env/exports, and the `| tee reports/pokeapi.cli.txt` pipe are kept
   unchanged, so Newman's exit code is still preserved and a failed assertion
   still fails the job.
3. **`Generate Allure report`** — a new `if: always()` step running
   `npx allure generate reports/allure/results --clean -o reports/allure/report`.
   Because the global install puts `allure` on `PATH`, `npx` uses the pinned
   `allure-commandline@2.46.1`. This step only reads results and writes the report
   directory, so it cannot change the job's pass/fail.
4. **`Upload Allure report`** — a new `if: always()` step using
   `actions/upload-artifact` (pinned by the same commit SHA already used in the
   workflow, `v4.4.3`) to upload the report as the artifact
   **`pokeapi-allure-report`** from `reports/allure/report`, with
   `if-no-files-found: warn`.

Both new steps use `if: always()`, so even a **red** run (a failed assertion)
still builds and uploads the Allure report. No workflow triggers, concurrency,
permissions, or existing steps/jobs were changed. Artifact upload needs no extra
permissions.

### Where to view / download the report

Allure is **artifact-only**. After a workflow run:

1. Open the run in the repository's **Actions** tab.
2. Scroll to the **Artifacts** section at the bottom of the run summary.
3. Download **`pokeapi-allure-report`** and unzip it.
4. Open `index.html`. Allure is a JavaScript single-page app, so serve the folder
   over HTTP rather than opening the file directly — the simplest way is
   `allure open <unzipped-folder>` locally (needs Java), or any static file
   server.

### Required repository settings

**None** for the artifact-only setup. Artifact upload works with the default
permissions and requires no Pages configuration, no secrets, and no branch setup.

Publishing Allure to **GitHub Pages is optional and intentionally not enabled**
(see the coexistence rule below). If a maintainer ever chooses to enable it, it
reuses the existing `pages`/`id-token` permissions and adds none.

## GitHub Pages coexistence rule

This repo already uses GitHub Pages and the `gh-pages` branch, and Allure must not
disturb either:

- The **`deploy-pages`** job publishes the latest htmlextra report as the
  **single root `index.html`** of the Pages site via `actions/deploy-pages`
  (OIDC). That root page is the primary published artifact.
- The **`gh-pages`** branch is the **data store for the benchmark trend** under
  `trend/` (written by `benchmark-action/github-action-benchmark`). The
  `deploy-pages` job reads `gh-pages/trend/` and bundles it into the Pages
  deployment.

Common Allure publishing recipes (for example
`simple-elf/allure-report-action` + `peaceiris/actions-gh-pages`, or writing an
`allure-history/` tree to the Pages root) push to the **`gh-pages` branch root**
and would **clobber both** the single root `index.html` and the `trend/` store.
To avoid that, this integration is **artifact-only** and does **not** publish
Allure to Pages.

**Rule for anyone enabling Allure on Pages later:**

- Do **not** point any Allure publish step at the `gh-pages` branch root or at the
  Pages root `index.html`.
- Publish Allure to a **distinct subpath**, e.g. `/allure/`, and leave the root
  `index.html` and the `trend/` directory untouched.
- Allure's historical trend (its own `history/` folder) is likewise **not** wired
  up here. Enabling it would require carefully isolating Allure history on
  `gh-pages` so it cannot overwrite `trend/`; it is left as a documented manual
  opt-in rather than something this workflow does automatically.

## Troubleshooting

- **Empty or missing results directory.** If `allure generate` reports that the
  results directory does not exist or the report is empty, the Newman run almost
  certainly wrote results somewhere else. Confirm you passed
  `--reporter-allure-export reports/allure/results` (not
  `--reporter-allure-resultsDir`, which `2.15.1` ignores — see the note above) and
  check for a stray `./allure-results` directory in the repo root.
- **`allure` needs Java.** `allure-commandline` is a Java application; the `allure`
  CLI requires a **JRE/JDK on `PATH`** to run `generate`/`open`. GitHub's
  `ubuntu-latest` runners ship a JDK, so CI works out of the box. Locally, install
  a Java 8+ runtime if `allure --version` or `allure generate` fails with a
  "java: command not found" / "JAVA_HOME" error.
- **`npx` tries to download Allure 3.** `npx allure ...` only uses the pinned
  `allure-commandline@2.46.1` when the global install's `bin` directory is on
  `PATH` (as it is in CI right after `npm install -g`). If you run the generate
  command in an environment where the global `allure` is not on `PATH`, `npx` may
  fetch a newer `allure` (3.x) from the registry. Ensure the global bin is on
  `PATH`, or call the `allure` binary directly instead of via `npx`.
- **Report looks broken when opened from disk.** Allure reports are JS-driven SPAs
  and must be served over HTTP. Use `allure open reports/allure/report` or a static
  server rather than opening `index.html` with a `file://` URL.

## Limitations

- **Allure 2 line.** This integration uses the Allure 2 reporter + CLI. It does not
  use Allure 3.
- **No history / trend wired up.** Allure's own history (`history/`) and trend are
  not configured, because persisting them in this repo would collide with the
  `gh-pages` `trend/` store (see the coexistence rule). Each run's report is
  self-contained.
- **Newman feature coverage.** Advanced Allure features such as linking tests to
  issues/TMS or test plans are not supported through the Newman reporter and are
  not used here.
- **Artifact-only by default.** The report is downloaded from the run's Artifacts;
  it is not published to a URL unless a maintainer opts in via the documented
  `/allure/` subpath approach.

## How to disable or remove

The integration is self-contained; reverting it leaves every other reporter and
the Pages/trend setup working. In
[`.github/workflows/postman-ci.yml`](../../.github/workflows/postman-ci.yml):

1. In the **`Run collection`** step, remove `allure` from the `--reporters` list
   (back to `cli,junit,json,htmlextra`) and delete the
   `--reporter-allure-export reports/allure/results` line.
2. Delete the **`Generate Allure report`** step.
3. Delete the **`Upload Allure report`** step.
4. In the **`Install Newman (pinned)`** step, drop
   `newman-reporter-allure@2.15.1 allure-commandline@2.46.1` from the
   `npm install -g` line.

Nothing else depends on Allure: no permissions, Pages config, or other steps were
added, so removing the above fully reverts the feature. Locally you can also
`npm uninstall -g newman-reporter-allure allure-commandline`.

## SDET learning notes

- **Why artifact-first, Pages-optional.** Choosing the Actions artifact as the
  default keeps the new reporter fully **isolated** and **independently
  removable**: it needs no permissions, no Pages wiring, and cannot clobber the
  existing single-root Pages deployment or the `gh-pages` `trend/` store. Pages
  publishing is a bigger, cross-cutting decision, so it is documented but left off.
- **How Newman output reaches Allure.** During the single `newman run`, the
  `newman-reporter-allure` reporter writes one `*-result.json` per test (plus
  `*-container.json` and request/response attachments) into the results directory.
  `allure generate` then reads those JSON files and renders them into a static,
  JS-driven HTML single-page app (`index.html` + `data/`). Results are raw data;
  the report is the rendered view of that data.
- **How CI still fails on real test failures.** The pass/fail gate is the
  `Run collection` step alone. `set -o pipefail` makes the pipeline return Newman's
  exit code (not `tee`'s), so a failed assertion returns non-zero and fails the
  job. The Allure `generate` and `upload` steps are **separate** steps marked
  `if: always()`; they run on red runs too but can only read results and write
  files, so they **cannot mask** the run step's exit code.
- **Capabilities gained.** A rich, browsable report with per-test drill-down,
  durations, graphical overview, and request/response attachments — easier to
  explore than a flat HTML page or raw JUnit XML.
- **Remaining limitations.** No trend/history, Allure 2 line, and no issue/TMS
  linking through the Newman reporter (see Limitations).
- **Concepts worth learning next.** CI **artifacts** vs. **Pages publishing**;
  **OIDC-based** Pages deploys (`actions/deploy-pages`); **reporter isolation**
  (independent add/remove, distinct output paths); and **exit-code propagation
  through pipes** (`pipefail` + `tee`).
