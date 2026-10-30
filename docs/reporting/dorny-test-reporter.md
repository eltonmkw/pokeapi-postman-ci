# Reporter: JUnit + dorny/test-reporter

GitHub Checks integration for the PokéAPI Newman suite. This reporter turns the
JUnit XML that Newman already produces into a per-run **Check** in the GitHub UI,
so you can see pass/fail per request — and the message of any failed assertion —
without downloading an artifact.

- **Reporter name:** [`dorny/test-reporter`](https://github.com/dorny/test-reporter)
- **Input format:** JUnit XML (`reporter: java-junit`)
- **Purpose:** publish a readable GitHub Check + annotations from each CI run.

## How it fits the pipeline

Newman is run once. Its built-in `junit` reporter writes
`reports/pokeapi.junit.xml`. A small CI step copies that file to a
reporter-owned path, `reports/junit/pokeapi.junit.xml`, and `dorny/test-reporter`
reads the copy and publishes a Check. **No second test run** — the same run's
output feeds every reporter.

```
newman run ... --reporters cli,junit,json,htmlextra
      │
      └─ reports/pokeapi.junit.xml  (canonical; also feeds job-summary + trend)
             │  cp (Stage JUnit step)
             └─ reports/junit/pokeapi.junit.xml  (owned by this reporter)
                    │
                    └─ dorny/test-reporter  →  GitHub Check "PokéAPI test results"
```

## Dependencies

None beyond what the repo already uses. JUnit XML comes from Newman's built-in
`junit` reporter — there is **no npm package to install** for this reporter. The
action itself is referenced by the workflow and runs on GitHub's runner.

## Local execution

The report this reporter consumes is produced by the standard run command (from
the repo root):

```bash
set -o pipefail
mkdir -p reports reports/junit
newman run postman/pokeapi.postman_collection.json \
  --reporters cli,junit,json \
  --reporter-junit-export reports/pokeapi.junit.xml \
  --reporter-json-export reports/pokeapi.results.json \
  | tee reports/pokeapi.cli.txt
# Mirror the CI "Stage JUnit" step:
cp reports/pokeapi.junit.xml reports/junit/pokeapi.junit.xml
```

`dorny/test-reporter` only runs inside GitHub Actions, so there is no local
equivalent of the Check — locally, inspect `reports/junit/pokeapi.junit.xml`
directly (see the [troubleshooting guide](../troubleshooting.md)).

## GitHub Actions integration

All in the existing workflow, [`.github/workflows/postman-ci.yml`](../../.github/workflows/postman-ci.yml):

1. **Stage JUnit for dorny/test-reporter** (`if: always()`) copies the Newman
   JUnit to `reports/junit/pokeapi.junit.xml`.
2. **Publish per-run test report** runs `dorny/test-reporter` (pinned to v3.0.0
   by commit SHA) with:
   ```yaml
   with:
     name: PokéAPI test results
     path: reports/junit/pokeapi.junit.xml
     reporter: java-junit
     fail-on-error: false
   ```
3. **Upload test reports** attaches `reports/junit/pokeapi.junit.xml` to the run
   artifact (`pokeapi-reports`).

Both the stage and publish steps use `if: always()`, so they run even when the
tests fail — but they never alter the `Run collection` exit code, so a failed
assertion still fails the job.

### Triggers and permissions

Unchanged from the existing workflow: `push`/`pull_request` on `main`,
`workflow_dispatch`, and a daily `schedule`. The action needs **`checks: write`**
(already granted at the workflow level) to create the Check run.

### Fork-PR safety

The publish step is skipped for pull requests from a fork
(`github.event.pull_request.head.repo.fork == false` guard). Fork PRs get a
read-only token, so creating a Check would fail and turn an otherwise-green run
red. Same-repo PRs, pushes, schedule, and manual runs still publish normally.

## Where to view / download the report

- **GitHub Check:** open the run → the **Checks** tab shows
  *"PokéAPI test results"* with per-testcase pass/fail and failure messages.
  (On newer action versions the Check may appear on the run of the Check itself;
  see Limitations.)
- **Artifact:** the run's **Artifacts** section → `pokeapi-reports` →
  `reports/junit/pokeapi.junit.xml` (raw JUnit).

## Required GitHub settings / secrets

- **Secrets:** none. The collection hits the public PokéAPI; the action uses the
  default `GITHUB_TOKEN`.
- **Settings:** `checks: write` permission (already in the workflow). No repo
  settings change is required for this reporter.

## Version note

Pinned to **`dorny/test-reporter@a43b3a5…` (v3.0.0)** by commit SHA. v3 runs on
the **Node 24 action runtime**, which `ubuntu-latest` provides; this is
independent of the `actions/setup-node` step (that step only provisions Node for
the Newman install). The previous pin was v1.9.1 — `reporter: java-junit` and the
`name`/`path`/`fail-on-error` inputs are unchanged between those versions, so the
bump is config-compatible.

## Troubleshooting

- **Check doesn't appear:** confirm `reports/junit/pokeapi.junit.xml` exists (the
  Stage step logs whether it copied) and that the run isn't a fork PR (guarded by
  design).
- **"Report not found" / empty Check:** the JUnit file was missing or empty —
  check that `Run collection` actually produced `reports/pokeapi.junit.xml`.
- **Red run but green Check:** expected. `fail-on-error: false` means the reporter
  never flips the job result; the authoritative pass/fail is the `Run collection`
  step.
- **Check shows on a separate "Test report" run:** a known behaviour change in
  recent action versions ([issue #750](https://github.com/dorny/test-reporter/issues/750)).
  The results are still published; look for the Check named *PokéAPI test results*.

## Limitations

- Only runs in GitHub Actions — no local Check.
- Skipped on fork PRs (read-only token). This is intentional.
- `java-junit` reports pass/fail and messages, not rich HTML; for a browsable
  report use the htmlextra output on GitHub Pages.
- It reports results; it does not decide the job outcome (`fail-on-error: false`).

## How to disable or remove this reporter

This reporter is self-contained and removable without touching other reporters:

1. **Disable temporarily:** set `if: false` on the **Publish per-run test report**
   step (or add `&& false` to its existing `if:`).
2. **Remove fully:** delete the **Stage JUnit for dorny/test-reporter** and
   **Publish per-run test report** steps, and drop the
   `reports/junit/pokeapi.junit.xml` line from the **Upload test reports** step.
   You may leave `checks: write` in `permissions` or tighten it if no other step
   needs it.

Removing it does not affect the Newman run, the job summary, the trend chart, or
the GitHub Pages HTML report.

---

## SDET learning notes

- **Why this architecture:** JUnit XML is a lingua franca. Newman emits it for
  free, and a huge ecosystem of CI tools consumes it. Choosing a JUnit-based
  reporter means the *test run* and the *reporting* are decoupled — you can add or
  swap reporters without re-running tests or rewriting assertions.
- **How Newman output reaches the tool:** Newman's `--reporter-junit-export`
  writes a standard `<testsuites>/<testsuite>/<testcase>` document; each `pm.test`
  becomes a `<testcase>`, and a failed assertion adds a `<failure>` with the Chai
  message. The action parses that file — it never talks to PokéAPI itself.
- **How Actions handles failed API tests:** the job fails because of the
  `Run collection` step's non-zero exit (`set -o pipefail` keeps Newman's exit
  code through the `tee` pipe). Reporting steps use `if: always()` so they still
  publish on red, but with `fail-on-error: false` they can't hide a real failure.
  Separating "run" from "report" into different steps is what keeps failures
  visible.
- **Capabilities gained:** per-request pass/fail and failure messages in the
  GitHub UI (Checks), plus the raw JUnit as a downloadable artifact — no local
  tooling needed to triage a CI failure.
- **Limitations that remain:** no local Check, reduced function on fork PRs, and
  JUnit carries less detail than a purpose-built HTML report.
- **Concepts worth learning from this:** CI permission scoping (`checks: write`
  and why fork PRs are read-only), step-level `if:` conditions (`always()`),
  preserving exit codes through pipes (`pipefail`), pinning actions by commit SHA
  for supply-chain safety, and the value of a common machine-readable test format
  (JUnit) for tool interoperability.
