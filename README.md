# pokeapi-postman-ci

## What this is

This repository tests the public [PokéAPI](https://pokeapi.co) using a Postman
collection. The collection makes a few HTTP requests and asserts things about the
responses (status codes, body fields). You can run it on your own machine with a
command-line tool, and it also runs automatically in GitHub Actions on every push
and pull request. The goal is a small, beginner-friendly example of API testing
plus continuous integration (CI).

The tested artifact is a single file,
`postman/pokeapi.postman_collection.json` (a Postman Collection in v2.1 format).
Both your local runs and CI use that exact same file, so what you test locally is
what CI tests.

## Prerequisites and setup

You need:

- **Node.js** v20 or newer (v22 LTS recommended) and **npm**. Check with
  `node --version` and `npm --version`.
- A command-line collection runner. Two official Postman tools are relevant:
  - **Postman CLI** (`postman-cli`, the binary is `postman`) for a quick official
    check.
  - **Newman**, Postman's officially maintained command-line Collection Runner,
    which is what produces the JUnit XML and JSON reports.

Install both globally:

```bash
npm install -g postman-cli
npm install -g newman
```

CI pins the runner to `newman@6.2.3` so builds are reproducible. You can pin the
same version locally with `npm install -g newman@6.2.3` if you want an exact match.

> **No Postman API key is needed** to run the committed collection file against the
> public PokéAPI. The requests go straight to `https://pokeapi.co`. You only need a
> Postman account/key if you later choose to sync the collection to the Postman
> cloud (see "Setup that still needs you" below). Never commit a key.

## Run locally

Two ways to run, depending on what you want.

**1. Quick official-CLI check** (human-readable pass/fail only):

```bash
postman collection run postman/pokeapi.postman_collection.json
```

**2. Full run that produces all three report forms** (CLI text, JUnit XML, JSON).
This is the exact command CI uses:

```bash
set -o pipefail
newman run postman/pokeapi.postman_collection.json \
  --reporters cli,junit,json \
  --reporter-junit-export reports/pokeapi.junit.xml \
  --reporter-json-export reports/pokeapi.results.json \
  | tee reports/pokeapi.cli.txt
```

Newman's `cli` reporter only prints to the terminal (it has no export flag in
this version), so the command pipes stdout through `tee` to also save it as
`reports/pokeapi.cli.txt`. `set -o pipefail` makes the pipeline exit with
Newman's exit code rather than `tee`'s, so a failed request or assertion still
reports a failure instead of being masked by the pipe.

> **Why two tools?** The official Postman CLI cannot export JUnit or JSON reports
> (it only writes YAML via `--output`). The three report forms this project needs
> (CLI text, JUnit XML, JSON) are produced by Newman, so Newman is used for the
> reporting run while the Postman CLI gives a fast official sanity check.

### What a successful run looks like

The real local run against the public PokéAPI produced:

- **3 requests**
- **8 assertions**
- **0 failures**

### Report locations

Reports are written into the `reports/` directory:

| Report form   | Path                          |
| ------------- | ----------------------------- |
| CLI text      | `reports/pokeapi.cli.txt`     |
| JUnit XML     | `reports/pokeapi.junit.xml`   |
| JSON          | `reports/pokeapi.results.json`|

The contents of `reports/` are gitignored and regenerated on every run. Only
`reports/.gitkeep` is tracked, so the directory exists but the generated files are
never committed.

## The collection

The collection defines a **collection variable** `base_url` set to
`https://pokeapi.co`, referenced in every request URL as `{{base_url}}`. Changing
one variable repoints all requests.

It contains exactly 3 requests (no folders, no scheduled or load tests):

1. **Get Pikachu** - `GET {{base_url}}/api/v2/pokemon/pikachu/`
   Asserts: status is `200`, `id` is `25`, `name` is `pikachu`, and the `types`
   array includes `electric`. (4 assertions)
2. **List first 5 Pokémon** - `GET {{base_url}}/api/v2/pokemon/?limit=5&offset=0`
   Asserts: status is `200`, the `results` array has length `5`, and each result
   has a non-empty `name` and a valid `url`. (3 assertions)
3. **Nonexistent Pokémon returns 404** -
   `GET {{base_url}}/api/v2/pokemon/this-does-not-exist-9999/`
   Asserts: status is `404`. (1 assertion)

Total: 3 requests, 8 assertions.

## Continuous integration

The workflow at `.github/workflows/postman-ci.yml` runs the **same** collection
file as your local run. Key points:

- **Triggers**: `push`, `pull_request`, and manual `workflow_dispatch`.
- **Fails on failure**: it runs Newman and does not swallow the exit code, so any
  failing request or assertion fails the job.
- **Always uploads reports**: the artifact upload step uses `if: always()`, so the
  CLI text, JUnit XML, and JSON reports are uploaded even when the test step fails.
  You can download them from the run's "Artifacts" section to debug.
- **Minimal permissions**: the workflow sets `permissions: contents: read`, so the
  job's token can only read the repository and nothing else.
- **Pinned versions**: the GitHub Actions are pinned by commit SHA (with a version
  comment) and Newman is pinned to `6.2.3`.
- **No secrets**: no Postman API key or secret is referenced anywhere. The
  committed collection runs directly against the public PokéAPI.

> **Why these choices?** Running the committed file directly keeps CI simple and
> means CI tests exactly what is in Git (no hidden cloud state). Pinning action
> SHAs and the Newman version makes builds reproducible and guards against a
> dependency changing under you. Minimal token permissions follow the principle of
> least privilege, so a compromised step cannot do more than read the repo.

## Editing in Postman and committing back

If you prefer the Postman app's visual editor, the round trip is:

1. Open the Postman app and choose **Import**.
2. Import the file `postman/pokeapi.postman_collection.json`.
3. Edit requests or test scripts in the Postman UI.
4. **Export** the collection as **Collection v2.1** and save it over the same file
   path, `postman/pokeapi.postman_collection.json`, so the tracked file is updated.
5. Commit and push the change with Git:

   ```bash
   git add postman/pokeapi.postman_collection.json
   git commit -m "Update PokéAPI collection"
   git push
   ```

6. Pushing (or opening a pull request) triggers the CI workflow, which reruns the
   collection with your edits.

Always re-export over the same path and in the v2.1 format so the diff stays clean
and CI keeps working.

## Git versioning vs Postman workspace sync

These are two different places the collection can live. It helps to keep them clear:

- **Git-based collection versioning** (what this repo uses): the JSON file
  `postman/pokeapi.postman_collection.json` tracked in this repository is the single
  source of truth. CI runs it, and Git history records every change. This is fully
  self-contained and needs no Postman account.
- **Postman workspace synchronization**: the same collection can also live in the
  Postman cloud inside a Postman workspace, synced after you sign in with OAuth.
  This is convenient for editing in the Postman app and sharing with a team.

They relate because they can hold copies of the same collection, but they are not
automatically linked. If you edit the collection in the Postman app but do not
export and commit the file (or edit the file in Git but do not import it back into
Postman), the two copies **drift** and stop matching.

To keep them in sync, pick one of these:

- Manually **export from Postman and commit** (and **import into Postman** after
  editing the file), as described in the section above, or
- Use **Postman's built-in Git integration** to connect the workspace to this
  repository so changes flow between them.

For this project, the Git file remains the authoritative copy that CI runs.

## Setup that still needs you

Some steps cannot be automated and require you to act. These are optional and only
matter if you want to use the Postman cloud; they are never needed for the
committed-file CI run.

- **Postman OAuth sign-in (browser)**: signing in to Postman (for example to use
  the Postman MCP integration or to sync the collection to the Postman cloud)
  happens in your browser and needs your credentials. No one else can do this for
  you.
- **Postman workspace selection**: if you sync to the cloud, you choose which
  Postman workspace the collection lives in.
- **Optional Postman API key**: only needed if you later choose cloud sync or API
  automation. It is **never** required to run the committed collection file locally
  or in CI. If you create one, keep it out of Git. The `.gitignore` already blocks
  common credential files, and secrets must never be committed.
