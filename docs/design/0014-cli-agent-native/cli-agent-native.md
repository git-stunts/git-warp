# Design 0014: Agent-Native CLI Output

## Problem

The CLI has `--json` and `--ndjson` flags at the entrypoint, but most
command handlers ignore them and write human-readable text directly to
stdout. An agent calling `git warp info --json` may get structured
output; `git warp seek --json` may not. There is no adaptive rendering
— agents and humans receive the same wall of text.

## Thesis

Every CLI command should have two rendering modes:

1. **Structured** (`--json` / `--ndjson`): Pure data. No decoration.
   Machine-parseable. This is the agent surface.
2. **Human** (default): Rendered via Bijou components. Terminal-width-
   aware. Tables, trees, progress bars, color.

The command handler produces a **result object**. The renderer decides
how to present it. The handler never writes to stdout directly.

## Architecture

```
argv → parseArgs → commandHandler → ResultObject → Renderer → stdout
                                                      ↑
                                          --json?  → JSON.stringify
                                          --ndjson? → newline-delimited JSON
                                          human?   → Bijou components
```

### ResultObject contract

Every command handler returns a typed result:

```typescript
interface CommandResult {
  /** Exit code (0 = success, 1 = error, 2 = usage) */
  exitCode: number;
  /** Structured data for --json output */
  data: Record<string, unknown>;
  /** Human-readable summary (one line, for logs) */
  summary: string;
}
```

### Bijou rendering

Each command defines a `render(data, terminal)` function that uses
Bijou components to format the result for human consumption:

```typescript
// info command
function render(data: InfoResult, terminal: { width: number }): string {
  return bijou_table({
    columns: [{ header: 'Property' }, { header: 'Value' }],
    rows: Object.entries(data).map(([k, v]) => [k, String(v)]),
    width: terminal.width,
  });
}
```

### Exit code semantics

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Runtime error (domain error, I/O failure) |
| 2 | Usage error (bad args, unknown command) |
| 3 | Integrity warning (doctor findings, audit issues) |

## Migration plan

1. Define `CommandResult` interface in `bin/cli/types.ts`
2. Update `warp-graph.ts` entrypoint to use the result-based renderer
3. Convert each command handler one at a time:
   - Return `CommandResult` instead of writing to stdout
   - Add a `render()` function using Bijou components
   - Verify `--json` produces clean structured output
4. Add integration tests: each command with `--json` must produce
   valid JSON with a stable schema

## Bijou component mapping

| Command | Primary component |
|---------|------------------|
| info | `bijou_table` (key-value pairs) |
| check | `bijou_table` (node/edge counts) |
| tree | `bijou_tree` (hierarchical display) |
| doctor | `bijou_table` + `bijou_badge` (pass/fail) |
| seek | `bijou_timeline` (tick history) |
| materialize | `bijou_progress_bar` + summary table |
| query | `bijou_table` (result rows) |
| strand list | `bijou_table` |
| strand compare | `bijou_table` (diff) |
| trust | `bijou_table` (writer trust status) |
| bisect | `bijou_stepper` (bisect steps) |
| debug | `bijou_tree` + `bijou_table` |

## Open questions

1. Should `--format=bijou` be a third mode that emits Bijou markup
   for tools that can render it? (e.g., MCP tool results)
2. Should `--quiet` suppress all output except the exit code?
3. Should `--watch` be a universal flag for long-running observation?
