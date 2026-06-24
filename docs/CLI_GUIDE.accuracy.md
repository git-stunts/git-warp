---
accuracy_report: true
schema: git-warp-doc-accuracy-v1
source_document: docs/CLI_GUIDE.md
created: 2026-06-24
last_updated: 2026-06-24
reviewer: codex
evidence_policy: source-code-only
lifecycle: temporary_planning
planning_phase: documentation_reorganization
retire_after: recommendations_executed
status: active
score: 78
score_label: mostly_accurate_should_generate_reference
disposition: revise
keep:
  - operator_workflows
  - removed_view_flag_note
  - command_family_grouping
  - unsafe_localhost_warning
roll_into:
  - docs/topics/cli.md
  - docs/generated/cli-reference.md
cut:
  - illustrative_unverified_output
  - manual_command_reference
  - top_level_doc_status
---

# CLI guide accuracy report

## Verdict

The CLI guide is mostly aligned with the command registry and is a good
candidate for `docs/topics/cli.md`. Exact command/option reference should be
generated from the CLI help and registry.

Score: **78/100**.

Disposition: **revise**.

Lifecycle rule: this report is temporary planning evidence for the docs
reorganization pass and should be deleted after CLI docs are moved/generated.

## Worth keeping

- Keep the operator workflow shape. The registry includes `info`, `check`,
  `doctor`, `query`, `path`, `tree`, `history`, `seek`, `debug`, `patch`,
  `strand`, `sync`, `serve`, `checkpoint`, `gc`, `watch`, and related commands
  ([registry.ts:41](../bin/cli/commands/registry.ts#L41)).
- Keep the removed `--view` note. The entry point rejects `--view` and tells
  readers to use `warp-ttd` for visualization ([warp-graph.ts:55](../bin/warp-graph.ts#L55),
  [infrastructure.ts:123](../bin/cli/infrastructure.ts#L123)).
- Keep JSON/NDJSON scripting guidance. The CLI normalizes payloads and emits
  JSON or NDJSON through the entry point ([warp-graph.ts:85](../bin/warp-graph.ts#L85),
  [warp-graph.ts:110](../bin/warp-graph.ts#L110)).
- Keep the unauthenticated-localhost warning. The help text exposes the unsafe
  mode explicitly ([infrastructure.ts:210](../bin/cli/infrastructure.ts#L210)).

## What to cut or rewrite

- Label or remove "typical operator output" unless captured from an executable
  fixture. The command existence is source-backed; the box output is not.
- Stop hand-maintaining command reference detail in prose. Generate exact
  command/option listings from `HELP_TEXT` or the command registry.
- Move this from top-level docs to `docs/topics/cli.md`.

## Roll-in recommendation

Keep the workflows as human-authored topic material and generate the exact CLI
reference into `docs/generated/cli-reference.md`.
