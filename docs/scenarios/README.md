# Scenario drop folder

Drop a scenario or requirement Markdown file in this folder and the
`generate-api-tests` Kiro hook will scaffold a reviewed scenario table and then
draft Newman assertions for the rows marked `Automate: Yes`.

- The hook reads the saved document and produces a table with the columns
  `Title | Expected behaviour/source | Priority | Automate | Reason`.
- For each `Automate: Yes` scenario it drafts deterministic `pm.test` assertions
  into the correct folder (`pokemon`, `pagination`, or `errors`) of
  `postman/pokeapi.postman_collection.json`.
- The edits are proposed for review, never applied silently, and assertions are
  never weakened to get green.

See [`.kiro/hooks/generate-api-tests.json`](../../.kiro/hooks/generate-api-tests.json)
for the hook definition.
