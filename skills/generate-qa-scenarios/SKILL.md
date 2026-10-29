---
name: generate-qa-scenarios
description: >-
  Generate and design a reviewed set of QA test scenarios for an API endpoint or
  requirement before any assertions are written. Produces a prioritised scenario
  table with owner, automate decision, and reason, covering happy path, error
  cases, and edge cases from the documented contract. Use when asked to create,
  generate, design, or plan test cases or scenarios for an API such as PokeAPI,
  or to decide what to test before writing Newman/Postman assertions.
license: Apache-2.0
compatibility: >-
  Agent- and product-agnostic. Targets this repo's Postman Collection v2.1 at
  postman/pokeapi.postman_collection.json, run by Newman (newman@6.2.3, Node
  20+). Scenarios test observable HTTP behaviour of the public PokeAPI
  (https://pokeapi.co); network access to that host is needed to confirm
  documented behaviour. No application code exists in this repo.
metadata:
  source: AGENTS.md procedure (a) generate-api-scenarios
  repo: pokeapi-postman-ci
---

# generate-qa-scenarios

Turn an endpoint or a requirement into a reviewed set of test scenarios before
writing any assertions. This skill encodes the same procedure as the repo's
[AGENTS.md](../../AGENTS.md) "generate-api-scenarios" and defers to it and to the
[API testing guide](../../docs/api-testing.md) for the run command, folder
convention, and assertion taxonomy.

There is no application code in this repo. The system under test is the public
PokeAPI, so you never design tests that "fix" the API; you design scenarios for
observable HTTP behaviour and raise suspected defects with evidence. Keep request
volume low.

## Rules

- **No unit-level or internal tests.** Those belong to the API's own developers.
  Here you test observable HTTP behaviour (status, body shape, documented field
  values and relationships) only.
- **Every scenario gets an owner**, either `QA` or `Dev`. QA owns behaviour and
  contract scenarios; Dev owns anything that would require changing the service
  itself (for this repo that means raising it upstream, not editing code here).
- **Every scenario gets an Automate decision** (`Yes` or `No`) with a one-line
  reason, for example "stable, high value", "regression guard", or "one-off
  manual check, not worth automating".
- **Avoid overlapping scenarios.** If two scenarios assert the same behaviour,
  merge them into one.
- **Cover the happy path, the main error cases, and edge cases** drawn from the
  acceptance criteria or the documented contract.
- **Do not invent features.** Only test behaviour that the official
  [PokeAPI documentation](https://pokeapi.co/docs/v2) actually documents.

## Output format

Output a table in exactly this column format:

```
Title | Expected behaviour/source | Priority | Automate | Reason
```

Priority is `High`, `Med`, or `Low`. After the table, write the concrete steps
and assertions for each scenario marked `Automate: Yes`.

## Worked example (PokeAPI)

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

Once a scenario is marked `Automate: Yes` and approved, hand it to the
[write-newman-tests](../write-newman-tests/SKILL.md) skill to turn it into
deterministic assertions.
