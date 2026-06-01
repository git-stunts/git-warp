---
id: CLI_missing-commands
blocked_by: []
blocks: []
feature: api-capabilities
---

# Fill the remaining CLI command gaps

## Problem

The CLI now has TypeScript command modules and structured `--json` /
`--ndjson` output plumbing, but it still does not expose several operations
named by Design 0015.

Current command registry includes `info`, `check`, `doctor`, `materialize`,
`seek`, `query`, `path`, `history`, `debug`, `strand`, `verify-audit`,
`verify-index`, `reindex`, `trust`, `patch`, `tree`, `bisect`, and
`install-hooks`.

The missing families are still real operator surfaces:

- `sync`
- `serve`
- `fork`
- `checkpoint`
- `gc`
- `upgrade` / `migrate`
- `export` / `import`
- `watch`

Do not re-add `query`; the current command exists.

## Acceptance

- Add each command only when it maps to a current capability or explicit
  adapter/service boundary.
- Each handler returns structured payload data through the existing CLI
  renderer path.
- `--json` and `--ndjson` are covered for each new command.
- The user-facing docs and `docs/CLI_GUIDE.md` include the new command family
  after it exists.
- `upgrade` / `migrate` does not pretend a complete substrate upgrader exists;
  it either delegates to the active upgrader boundary or remains omitted until
  that boundary is real.

## Source

Rehomed from archived v17 residual note `CLI_missing-commands`. The old
`CLI_agent-native-output` blocker is not carried forward because the current
CLI already has the TypeScript command registry and structured output flags.
