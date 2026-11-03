# Implementation Plan: Newman Trend Reporting (Verification)

## Overview

This is a **verification-only** plan. The runtime code already exists and is committed:
`scripts/newman-trend-metrics.js` (Metrics_Extractor) and `scripts/link-chart-to-reports.js`
(Chart_Linker). The goal is to lock in the behavior those scripts already exhibit by turning
each of the 10 correctness properties in [design.md](design.md) into a property-based test.

There are no feature-build tasks: no changes to the GitHub Actions workflow, no wiring of the
Chart_Linker into `deploy-pages`, and no implementation of report archival or the multi-path
site layout. Requirements 10 and 11 (archival + multi-path layout) are an accepted, documented
**KNOWN GAP** for this spec and are recorded as a note rather than closed.

All tests are dependency-light and consistent with the committed test
(`scripts/newman-trend-metrics.test.js`): they drive the real scripts as child processes via
`execFileSync`, assert on `process.exit` codes and file side effects, and use synthetic reports
and synthetic HTML only (no network, honoring the repo's low-request-volume posture). Each
property-based test runs a **minimum of 100 iterations** and carries a tagging comment of the
form `Feature: newman-trend-reporting, Property {n}: {property text}`.

## Tasks

- [x] 1. Set up the property-based test harness
  - Add a `package.json` at the repo root declaring `fast-check` as the single dev dependency,
    with a `test` script that runs the property suite and the existing test via `node --test`
    (built-in `node:test` runner).
  - If no dev dependency is wanted, implement the documented fallback instead: a hand-rolled
    generator loop over ≥100 iterations inside `node:test` files with no external dependency.
  - Create the test directory/files that the property tests below will live in, importing the
    scripts only as child processes (never by `require`), matching the existing test's approach.
  - Add shared helpers (temp-dir creation/cleanup, synthetic `makeReport`, synthetic
    handler-bearing chart HTML builder, `runScript`/`runLinker` child-process wrappers).
  - _Requirements: all (test infrastructure for Properties 1–10)_

- [x] 2. Property tests for the Metrics_Extractor (`scripts/newman-trend-metrics.js`)
  - [x] 2.1 Write property test for the all-failures verdict rule
    - **Property 1: Verdict is fail iff some failure category is non-zero**
    - Generate non-negative integers `af`, `rf`, `nf`; write a synthetic report; run the script
      with `GITHUB_STEP_SUMMARY` set; assert the Result row is `❌ fail` iff `af+rf+nf > 0` and
      `✅ pass` exactly when all three are zero.
    - Minimum 100 iterations. Tag: `Feature: newman-trend-reporting, Property 1: Verdict is fail iff some failure category is non-zero`.
    - **Validates: Requirements 3.2, 3.3**

  - [x] 2.2 Write property test for run-level failure explanation row
    - **Property 2: Run-level failures are explained in the summary**
    - Same generator; assert the `Script/other failures` row is present iff `run.failures.length > 0`.
    - Minimum 100 iterations. Tag: `Feature: newman-trend-reporting, Property 2: Run-level failures are explained in the summary`.
    - **Validates: Requirements 3.4**

  - [x] 2.3 Write property test for the Metrics_File shape, values, and zero defaults
    - **Property 3: Metrics_File always has the three named entries with correct values and zero defaults**
    - Generate reports with each consumed field present or omitted; read back the output JSON;
      assert exactly three ordered objects named `Failed assertions` (`count`), `Failed requests`
      (`count`), `Avg response time` (`ms`) with values equal to `assertions.failed`,
      `requests.failed`, and `round(responseAverage)`, defaulting to `0` when a field is absent.
    - Minimum 100 iterations. Tag: `Feature: newman-trend-reporting, Property 3: Metrics_File always has the three named entries with correct values and zero defaults`.
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3**

  - [x] 2.4 Write property test for summary emission gated on the env var
    - **Property 4: Job_Summary is emitted iff GITHUB_STEP_SUMMARY is set, and never blocks the Metrics_File**
    - Generate parseable reports; run with and without `GITHUB_STEP_SUMMARY`; assert the
      Metrics_File is always written and the Job_Summary is appended only when the env var is
      present and non-empty.
    - Minimum 100 iterations. Tag: `Feature: newman-trend-reporting, Property 4: Job_Summary is emitted iff GITHUB_STEP_SUMMARY is set, and never blocks the Metrics_File`.
    - **Validates: Requirements 3.1, 3.5**

- [x] 3. Align the existing example-based test
  - Keep `scripts/newman-trend-metrics.test.js` alongside the new property suite (it covers
    Property 1 by example with three concrete points). Ensure it is discovered/run by the harness
    from task 1 (either invoked by the `test` script or left runnable standalone via
    `node scripts/newman-trend-metrics.test.js`).
  - Add a one-line comment linking it to Property 1 so its relationship to the property suite is
    explicit; do not weaken or remove any of its assertions.
  - _Requirements: 3.2, 3.3 (example coverage complementing Property 1)_

- [x] 4. Checkpoint - Metrics_Extractor properties pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Property tests for the Chart_Linker (`scripts/link-chart-to-reports.js`)
  - [x] 5.1 Write property test for matched-SHA linking and fallback
    - **Property 5: Chart_Linker links matched SHAs and falls back otherwise**
    - Generate handler-bearing chart HTML (exact and whitespace-varied) and a random set of
      archived SHAs; run the Chart_Linker; parse the rewritten `REPORTS` array and resolution
      logic; assert a point whose `commit.id` is in the set resolves to `<linkPrefix> + id + '.html'`,
      a miss resolves to `commit.url`, and the default prefix is `./reports/`.
    - Minimum 100 iterations. Tag: `Feature: newman-trend-reporting, Property 5: Chart_Linker links matched SHAs and falls back otherwise`.
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**

  - [x] 5.2 Write property test for the byte-for-byte no-op fallback
    - **Property 6: Chart_Linker is a no-op (byte-for-byte) and exits 0 when it cannot act**
    - For arbitrary HTML with no handler, or a missing/unreadable reports directory, assert the
      output bytes are identical to the input and the process exits `0`.
    - Minimum 100 iterations. Tag: `Feature: newman-trend-reporting, Property 6: Chart_Linker is a no-op (byte-for-byte) and exits 0 when it cannot act`.
    - **Validates: Requirements 6.1, 6.4**

  - [x] 5.3 Write property test for rewriting every handler occurrence
    - **Property 7: Chart_Linker rewrites every occurrence when the handler is present**
    - Generate HTML with `k ≥ 1` exact handler occurrences (and a whitespace-varied variant);
      assert every occurrence is rewritten and the process exits `0`.
    - Minimum 100 iterations. Tag: `Feature: newman-trend-reporting, Property 7: Chart_Linker rewrites every occurrence when the handler is present`.
    - **Validates: Requirements 6.2, 6.3**

- [x] 6. Property tests for the CLI exit-code contracts of both scripts
  - [x] 6.1 Write property test for exit 2 on invalid invocation (both scripts)
    - **Property 8: Both scripts exit 2 on invalid invocation without writing output**
    - For argument vectors with fewer than two positional args, assert the Metrics_Extractor
      exits `2` without creating/modifying the metrics output file, and the Chart_Linker exits
      `2` without modifying the chart HTML.
    - Minimum 100 iterations. Tag: `Feature: newman-trend-reporting, Property 8: Both scripts exit 2 on invalid invocation without writing output`.
    - **Validates: Requirements 4.1, 7.1**

  - [x] 6.2 Write property test for the Metrics_Extractor on an unreadable/unparseable report
    - **Property 9: Metrics_Extractor exits 2 on an unreadable or unparseable report without writing output**
    - For a nonexistent path and for non-JSON content, assert a stderr error message, no metrics
      output file created/modified, and exit `2`.
    - Minimum 100 iterations. Tag: `Feature: newman-trend-reporting, Property 9: Metrics_Extractor exits 2 on an unreadable or unparseable report without writing output`.
    - **Validates: Requirements 4.2, 4.3**

  - [x] 6.3 Write property test for the Chart_Linker on an unreadable chart
    - **Property 10: Chart_Linker exits 2 on an unreadable chart without modifying it**
    - For a valid two-argument invocation with a nonexistent chart path, assert a stderr error
      message, no chart HTML modified, and exit `2`.
    - Minimum 100 iterations. Tag: `Feature: newman-trend-reporting, Property 10: Chart_Linker exits 2 on an unreadable chart without modifying it`.
    - **Validates: Requirements 7.2**

- [x] 7. Record the Requirements 10–11 known gap
  - Add a short, clearly-labelled note (a comment block in the Chart_Linker property test file
    and/or a one-line entry in `docs/troubleshooting.md` or `docs/api-testing.md`) stating that
    report archival (Req 10) and the multi-path site layout (Req 11) are an accepted, documented
    KNOWN GAP for this spec: the Chart_Linker is built and verified in isolation but is not wired
    into `deploy-pages`, and these requirements are intentionally not covered by tests here.
    Reference the "Implementation state vs. requirements" table in design.md.
  - Do not add any task that closes the gap (no workflow edits, no wiring, no archival).
  - _Requirements: 10, 11 (documented known gap only)_

- [x] 8. Final checkpoint - run the whole suite and confirm all properties pass
  - Run the full test suite with `node` (the harness from task 1, plus the existing
    `scripts/newman-trend-metrics.test.js`) and confirm all 10 properties pass locally.
  - Confirm the run performs no network calls and uses only synthetic reports and synthetic HTML.
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- This plan is verification-only: it adds tests for already-committed code and changes no runtime
  behavior, no CI YAML, no Postman collection, and nothing touching the PokéAPI.
- Tasks marked with `*` are optional-to-skip in the UI sense, but they ARE the substance of this
  spec (the property-based tests); skipping them leaves the behavior unverified.
- Each property-based test maps to exactly one correctness property in design.md, runs a minimum
  of 100 iterations, and carries the `Feature: newman-trend-reporting, Property {n}: ...` tag.
- Tests run the scripts as child processes (`execFileSync`) because the scripts are CLI programs
  whose contract includes `process.exit` codes and file side effects, matching the existing test.
- Requirements 10 and 11 are an accepted, documented known gap (task 7); Requirements 8, 9, and
  12 are CI/infrastructure behaviors verified by the pipeline itself and are intentionally not
  expressed as property tests (see design.md "Correctness Properties" and "Integration coverage").

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3", "2.4", "5.1", "5.2", "5.3", "6.1", "6.2", "6.3"] },
    { "id": 2, "tasks": ["3"] },
    { "id": 3, "tasks": ["4", "7"] },
    { "id": 4, "tasks": ["8"] }
  ]
}
```
