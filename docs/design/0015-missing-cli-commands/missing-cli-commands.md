# Design 0015: Missing CLI Commands

## Problem

The domain layer has 9 capability namespaces. The CLI exposes ~15
commands covering ~60% of the capability surface. Key operations —
sync, fork, checkpoint management, GC, and substrate migration — have
no CLI entry point despite having full domain implementations.

## Missing commands

### Priority 1: Core operations

#### `git warp sync <remote> [--json]`

Sync with a remote peer (HTTP URL or local path).

```
git warp sync https://peer.example.com/events
git warp sync /path/to/peer/repo
git warp sync https://peer.example.com --auth-secret $SECRET
```

Maps to: `graph.governance.sync.syncWith(remote, options)`

Options: `--path`, `--retries`, `--timeout`, `--auth-secret`,
`--auth-key-id`, `--trust-mode`, `--materialize`

#### `git warp serve [--port PORT] [--json]`

Start a sync server for the current graph.

```
git warp serve --port 8080
git warp serve --port 0  # auto-assign
```

Maps to: `graph.governance.sync.serve(options)`

Options: `--port`, `--host`, `--auth-secret`, `--trust-mode`

#### `git warp fork <source-graph> <new-graph> [--json]`

Fork a graph, creating a new graph with shared history.

```
git warp fork events events-staging
git warp fork events events-staging --at-tick 42
```

Maps to: `graph.commitment.patches.fork(options)` (via ForkController)

Options: `--at-tick`, `--writer-id`

### Priority 2: Operational

#### `git warp checkpoint [create|restore|list] [--json]`

Explicit checkpoint management.

```
git warp checkpoint create
git warp checkpoint list
git warp checkpoint restore <sha>
```

Maps to: `graph.folding.checkpoint.*`

#### `git warp gc [--dry-run] [--json]`

Trigger garbage collection.

```
git warp gc
git warp gc --dry-run  # show what would be collected
```

Maps to: GC policy evaluation + execution

#### `git warp query <expression> [--json]`

Rich query interface using QueryBuilder syntax.

```
git warp query "nodes where type = 'user'"
git warp query "edges from user:alice"
git warp query "path from user:alice to user:bob"
```

Maps to: `graph.revelation.query.*` via QueryBuilder

### Priority 3: Lifecycle

#### `git warp migrate [--dry-run] [--json]`

Run substrate migrations (schema upgrades, index rebuilds).

```
git warp migrate
git warp migrate --dry-run
git warp migrate --from v14 --to v17
```

Maps to: MigrationService + INFRA_substrate-upgrade-tool

#### `git warp export <path> [--format cbor|json] [--json]`

Export graph state to a portable format.

```
git warp export ./backup.warp
git warp export ./state.json --format json
```

#### `git warp import <path> [--json]`

Import from a portable format.

```
git warp import ./backup.warp
```

### Priority 4: Observability

#### `git warp watch [--json]`

Long-running subscriber that emits state changes.

```
git warp watch
git warp watch --ndjson  # one JSON object per change
```

Maps to: `graph.revelation.subscriptions.subscribe()`

## Implementation plan

Each command follows the agent-native pattern from Design 0014:
- Handler returns `CommandResult`
- Structured output via `--json`
- Human output via Bijou components

Commands are added one at a time, each with:
1. Command handler in `bin/cli/commands/<name>.ts`
2. Zod schema in `bin/cli/schemas.ts`
3. Registration in `bin/cli/commands/registry.ts`
4. Integration test verifying `--json` output
5. CHANGELOG entry

## Open questions

1. Should `sync` support bidirectional sync in one command?
2. Should `query` support a mini query language, or just expose
   individual operations as subcommands?
3. Should `export/import` use git-cas for the transport format?
4. Should `watch` support filtering (e.g., `--match "user:*"`)?
