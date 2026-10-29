# Agent Skills for pokeapi-postman-ci

This directory holds portable **Agent Skills** in the open
[agentskills.io](https://agentskills.io) format (originally from Anthropic). Each
skill is a directory containing a `SKILL.md` file with YAML frontmatter (a `name`
matching the directory and a `description` stating what the skill does and when to
use it) followed by a Markdown body. The format is agent- and product-agnostic, so
these skills work with any skills-compatible agent rather than a single vendor.

## The skills

- [`generate-qa-scenarios`](generate-qa-scenarios/SKILL.md) - design a reviewed,
  prioritised set of API test scenarios before writing assertions.
- [`write-newman-tests`](write-newman-tests/SKILL.md) - turn an approved scenario
  into deterministic Newman/Postman `pm.test` assertions.
- [`investigate-failing-assertion`](investigate-failing-assertion/SKILL.md) -
  classify and decide what to do about a failing assertion, human-in-the-loop.
- [`triage-flaky-run`](triage-flaky-run/SKILL.md) - triage an intermittent or
  environmental failure without weakening the suite.

## Kiro automation

Three Kiro hooks wire these skills into save-triggered feedback. Each is an
agent-prompt hook; none runs a script or adds a dependency.

- [`.kiro/hooks/pokeapi-postman-tests.json`](../.kiro/hooks/pokeapi-postman-tests.json) -
  on a save under `postman/**` or the CI workflow YAML, runs Newman; on a red run
  it applies [`investigate-failing-assertion`](investigate-failing-assertion/SKILL.md)
  to classify the failure and propose a minimal fix.
- [`.kiro/hooks/generate-api-tests.json`](../.kiro/hooks/generate-api-tests.json) -
  on a save under `docs/scenarios/`, applies
  [`generate-qa-scenarios`](generate-qa-scenarios/SKILL.md) to build the scenario
  table and [`write-newman-tests`](write-newman-tests/SKILL.md) to draft
  assertions for the `Automate: Yes` rows, proposed for review.
- [`.kiro/hooks/validate-skills.json`](../.kiro/hooks/validate-skills.json) -
  on a save of any `skills/*/SKILL.md`, validates the file against the
  agentskills.io format and proposes the minimal fix for any violation.

## How progressive disclosure works

An agent first sees only each skill's `name` and `description`, which it uses to
**discover** when a skill is relevant to the task at hand. When a skill is
selected, the agent **activates** it by loading the Markdown body, which carries
the full procedure. Longer detail stays in the repo's existing docs, which the
bodies link to with relative paths, so the `SKILL.md` files remain small.

## Relationship to AGENTS.md

These skills are the portable, discoverable form of the four procedures in the
root [AGENTS.md](../AGENTS.md) playbook, adapted to this repo's Postman/Newman
setup. They keep the same discipline: never weaken an assertion to get green,
there is no application code so you never "fix" the API, and failures and flaky
runs are classified with a human in the loop. The source of truth for the run
command, folder conventions, and failure-reading detail remains
[AGENTS.md](../AGENTS.md), [docs/api-testing.md](../docs/api-testing.md), and
[docs/troubleshooting.md](../docs/troubleshooting.md).
