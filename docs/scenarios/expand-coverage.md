# Scenario request: expand PokéAPI coverage

This is an example scenario document for the `generate-api-tests` Kiro hook (see
the [drop-folder README](README.md)). Saving a file like this triggers the hook
to produce a reviewed scenario table and then draft Newman assertions for the
rows marked `Automate: Yes`. It is a request for coverage, not a finished test:
the hook proposes edits for review and never applies them silently.

## Intent

Grow the Newman suite beyond the current pokemon-by-name, list, and 404 cases.
Add documented, deterministic coverage for additional PokéAPI resources and
contracts. Keep request volume low and follow the `pokemon` / `pagination` /
`errors` folder convention in [docs/api-testing.md](../api-testing.md).

## Source of truth

Official PokéAPI docs: https://pokeapi.co/docs/v2 (confirm expected shapes and
values before asserting). There is no application code in this repo; the system
under test is the live public API.

## Candidate behaviours to cover (pick the highest-value, non-overlapping ones)

1. Type resource: `GET /api/v2/type/electric/` returns `200`; `name` is
   `electric`; `damage_relations` is an object; each entry under
   `double_damage_to` / `half_damage_from` and similar lists is a valid named
   reference (`{ name, url }` with `/api/v2/type/` in the url). (relationship or
   invariant)
2. Ability resource: `GET /api/v2/ability/static/` returns `200`; `id` integer,
   `name` string, `is_main_series` boolean; `effect_entries` is a non-empty array
   and at least one entry has `language.name` equal to `en`. (field types plus
   documented shape)
3. Id-vs-name consistency: `GET /api/v2/pokemon/25/` and
   `GET /api/v2/pokemon/pikachu/` resolve to the same resource (same `id` and
   `name`). (invariant)
4. Pagination boundary: `GET /api/v2/pokemon/?limit=5&offset=5` returns `200`,
   `results` length `5`, `previous` is non-null and `next` is a string, and the
   first result differs from the `offset=0` page. (list contract across a page
   boundary)
5. Distinct negative case: `GET /api/v2/ability/this-does-not-exist-9999/` returns
   `404` (a negative case on a different resource than the existing pokemon 404).

## Constraints (must hold)

- Assert field types and documented values, not brittle full-response snapshots.
- No response-time thresholds. Use `{{base_url}}` in every URL.
- Deterministic `pm.test` / `pm.expect`; one lowercase outcome sentence per test.
- Never weaken, skip, or comment out an assertion to get green; raise a suspected
  API defect with evidence instead of editing the test to pass.
- Keep request volume low: fold multiple assertions onto a single request where
  possible; add only a few new requests. Prefer a folder-level or collection-level
  script for any shared named-reference or list-envelope check.
- Place each new request in `pokemon` / `pagination` / `errors` (or a justified
  new folder). Do not commit generated reports. No secrets, no new dependencies.

## Expected output

First, a reviewed scenario table with the columns
`Title | Expected behaviour/source | Priority | Automate | Reason` (owner QA or
Dev, Automate Yes or No plus a one-line reason). Then, for each `Automate: Yes`
row, drafted Newman assertions in the correct folder, proposed for review. Run
the collection locally with Newman and report the new totals.
