# pokeapi-postman-ci

A small example of API testing with Postman, Newman, and GitHub Actions.
The committed [collection](postman/pokeapi.postman_collection.json) tests the
public [PokéAPI](https://pokeapi.co). No API key or Postman account is required.

## Run locally

Install Node.js 20 or newer (22 recommended), then install the same Newman
version used in CI:

```bash
npm install -g newman@6.2.3
```

From the repository root, run this command in Bash to save CLI, JUnit, and JSON
reports:

```bash
mkdir -p reports
set -o pipefail
newman run postman/pokeapi.postman_collection.json \
  --reporters cli,junit,json \
  --reporter-junit-export reports/pokeapi.junit.xml \
  --reporter-json-export reports/pokeapi.results.json \
  | tee reports/pokeapi.cli.txt
```

`pipefail` ensures test failures fail the command even when output is piped
through `tee`. Generated reports are gitignored.

## Test coverage

The collection groups three requests into `pokemon`, `pagination`, and `errors`:

- **Get Pikachu:** checks status, identity, field types, and type relationships.
- **List first 5 Pokémon:** checks the pagination response and result entries.
- **Nonexistent Pokémon:** checks that an unknown resource returns `404`.

All requests use the collection variable `base_url`, which defaults to
`https://pokeapi.co`.

## Continuous integration

[GitHub Actions](.github/workflows/postman-ci.yml) runs the same collection on
pushes to `main`, pull requests targeting `main`, manual runs, and daily at
06:00 UTC. Failed requests or assertions fail the test step.

CI saves CLI, JUnit, JSON, and HTML reports and attempts to upload them even
when tests fail. Download reports from the run's **Artifacts** section.
Pushes to `main` also deploy the latest HTML report and trend history to
GitHub Pages.

## Edit the collection

Import `postman/pokeapi.postman_collection.json` into Postman, make your changes,
then export it as **Collection v2.1** over the same file. Run the tests before
committing. The file in Git is the source of truth; edits in a Postman workspace
must be exported and committed to reach CI.

## Guides

- [API testing](docs/api-testing.md): conventions and adding tests.
- [Troubleshooting](docs/troubleshooting.md): reading reports and investigating failures.
- [QA playbook](AGENTS.md): scenario planning, assertions, and flaky-run triage.
