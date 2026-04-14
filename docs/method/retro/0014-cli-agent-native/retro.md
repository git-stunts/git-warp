# Cycle 0014 Retro — CLI Agent-Native Output

**Status:** DESIGN COMPLETE — implementation deferred to v17.1.0

## What ground was taken

Audited all 15 CLI commands for structured output support. Found that
`--json`/`--ndjson` flags exist at the entrypoint but most handlers
ignore them. Designed the CommandResult pattern: handlers return data,
renderer decides presentation. Mapped every command to a Bijou
component for human output.

## Backlog items produced

- `CLI_agent-native-output` (up-next) — implement CommandResult +
  Bijou rendering during CLI TS conversion

## What we learned

1. **The entrypoint already has the flags.** `warp-graph.js` parses
   `--json` and `--ndjson` before dispatching. The infrastructure
   exists — the commands just don't use it.

2. **Bijou is the right rendering layer.** The existing hand-rolled
   text output is fragile and terminal-width-unaware. Bijou tables,
   trees, and badges map 1:1 to command output shapes.

3. **Converting CLI to TS and adopting CommandResult should happen in
   one pass.** Touching each file twice (rename then refactor) is
   wasteful. v17.1.0 should do both together.

## Open questions

1. Should `--format=bijou` emit Bijou markup for tools that render
   it (MCP tool results)?
2. Should `--quiet` suppress all output except exit code?
3. Should `--watch` be a universal flag for long-running observation?
4. How should streaming commands (watch, seek with live updates)
   interact with `--json`? NDJSON is the obvious answer but needs
   explicit design.
