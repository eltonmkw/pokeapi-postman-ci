# Troubleshooting guide: reading reports and classifying failures

This guide explains how to tell whether a Newman run passed or failed, how to find
the exact assertion that failed, how to classify why it failed, and how to verify
that the suite actually detects failures. For setup and the run command, see the
[README](../README.md). For the decision procedures behind the classifications
here, see the [AGENTS.md playbook](../AGENTS.md). For growing the suite, see the
[API testing guide](api-testing.md).

The run command (local and CI, from the repo root):

```bash
set -o pipefail
newman run postman/pokeapi.postman_collection.json \
  --reporters cli,junit,json \
  --reporter-junit-export reports/pokeapi.junit.xml \
  --reporter-json-export reports/pokeapi.results.json \
  | tee reports/pokeapi.cli.txt
```

## 1. Reading `reports/pokeapi.cli.txt` to see pass/fail

`reports/pokeapi.cli.txt` is the human-readable transcript of the run (the same
text Newman prints to the terminal, saved via `tee`). Read it top to bottom:

- Requests are printed under their **folder headings** (`pokemon`, `pagination`,
  `errors`), each followed by its assertions.
- A passing assertion is marked with a check; a **failing assertion is marked with
  a cross and a number** that points to a numbered entry in the failures section.
- The **summary table** at the bottom reports totals for `assertions`, with an
  `executed` count and a `failed` count. A healthy run shows `0` in the `failed`
  column.
- The **failure detail list** below the summary prints each failure with its
  assertion name and the expectation that did not hold (for example,
  `expected 200 to equal 404`).

If `failed` is `0` and the process exit code is `0`, the run is green. Because the
command uses `set -o pipefail`, the pipeline returns Newman's exit code (not
`tee`'s), so a failing assertion really does produce a non-zero exit and a failing
CI status.

## 2. Locating a failed assertion in `reports/pokeapi.junit.xml`

The JUnit XML is the precise, machine-readable record and the easiest place to pin
down a single failure:

- Each `<testsuite>` corresponds to a request (its folder path is included in the
  name), and each `<testcase>` is one `pm.test`. The **`name` attribute of the
  `<testcase>`** is the lowercase outcome sentence you wrote, for example
  `name="status code is 404"`.
- A passing testcase has no children. A **failing testcase contains a
  `<failure>` element** whose message is the assertion error, for example
  `<failure>expected 200 to equal 404</failure>` (often with a stack snippet).
- Find the failure by searching the file for `<failure` and reading the enclosing
  `<testcase name="...">`: the `name` tells you which assertion broke and the
  message tells you how. Cross-reference that name back to the request and folder
  in the collection to find the assertion in context.

## 3. Failure classification

Once you know which assertion failed and what the response was, classify the
failure before changing anything. Weakening a test is never the fix.

| Failure type | How to recognise it | What to do |
| ------------ | ------------------- | ---------- |
| **API defect** | An assertion like `expected 200 to equal 404` **with a response body present** (the service answered, but the answer contradicts the documented behaviour). | Raise it with evidence (the failing assertion message plus the response body). **Do NOT weaken the test.** |
| **Network failure** | `ECONNREFUSED`, `ENOTFOUND`, a DNS error, or a TLS error, with **no HTTP status** (the request never reached pokeapi.co). | Re-run once network access is available. The test is fine. |
| **Service availability** | A `502`/`503` or a request **timeout from pokeapi.co** (the service answered but was unhealthy, or did not answer in time). | Re-run later and **keep request volume low**. The test is fine. |
| **Incorrect assertion** | A **manual `GET` shows the response IS the documented behaviour**, so the assertion itself is wrong. | Fix the test to match the docs, with a **one-line reason** for the change. Keep it as strong as before. |

The key tell between an API defect and a network/availability issue is whether
there is an **HTTP status and a body**: if the service answered, it is a defect or
an assertion problem; if it never answered, it is a network or availability
problem.

## 4. Failure-detection drill (verify the suite actually catches failures)

A green suite is only trustworthy if it can also go red. Prove that on a
**practice branch**, never on a shared or default branch:

1. Create and switch to a throwaway practice branch.
2. **Temporarily change one expected value** so it no longer matches reality, for
   example flip an asserted `id` from `25` to `26`, or flip an expected status from
   `404` to `200`, in `postman/pokeapi.postman_collection.json`.
3. **Run the Newman command** above.
4. **Confirm the collection goes RED**: the process exits **non-zero**, the
   `failed` count in `reports/pokeapi.cli.txt` is at least `1`, and a
   `<failure>` appears for that testcase in `reports/pokeapi.junit.xml`. Because
   the command exits non-zero, **CI would report a failing status** for the same
   change.
5. **Restore the original value** (revert the edit) and re-run to confirm the
   suite is green again.

**Do not merge an intentionally-failing assertion.** The drill exists only to
prove the suite detects regressions; the deliberate break must be reverted on the
practice branch and never land on a real branch or in a pull request.
