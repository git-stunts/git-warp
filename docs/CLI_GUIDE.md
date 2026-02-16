# git warp CLI Guide

This guide teaches you the `git warp` command-line interface from scratch. Every command, every flag, and every output format is covered. The examples build on a single scenario — a software team managing their projects, people, and tasks as a graph — so each section layers naturally on the one before it.

## Contents

- [Installation](#installation)
- [The Scenario](#the-scenario)
- [Setting Up the Graph](#setting-up-the-graph)
- [Inspecting the Repository](#inspecting-the-repository) (`info`)
- [Querying Nodes and Edges](#querying-nodes-and-edges) (`query`)
- [Finding Paths](#finding-paths) (`path`)
- [Reviewing History](#reviewing-history) (`history`)
- [Time Travel](#time-travel) (`seek`)
- [Materializing State](#materializing-state) (`materialize`)
- [Health and Diagnostics](#health-and-diagnostics) (`check`, `doctor`)
- [Verifying Audit Integrity](#verifying-audit-integrity) (`verify-audit`)
- [Interactive Explorer](#interactive-explorer) (`view`)
- [Git Hook Integration](#git-hook-integration) (`install-hooks`)
- [Output Formats](#output-formats)
- [Global Options](#global-options)
- [Exit Codes](#exit-codes)
- [Command Reference](#command-reference)

---

## Installation

Install the package:

```bash
npm install @git-stunts/git-warp
```

The CLI is available in two forms:

```bash
# Direct invocation (available immediately after install)
npx warp-graph <command> [options]

# As a Git subcommand (after one-time setup)
npm run install:git-warp
git warp <command> [options]
```

Both forms are identical. This guide uses the `git warp` form throughout.

**Prerequisites:** Node.js >= 22.0.0, Git >= 2.0. The CLI also runs on Bun and Deno.

---

## The Scenario

Throughout this guide, we'll work with a graph that models a small software team:

- **People**: `user:alice` (engineering lead), `user:bob` (backend), `user:carol` (frontend), `user:dave` (devops)
- **Projects**: `project:api`, `project:dashboard`, `project:infra`
- **Tasks**: `task:auth`, `task:caching`, `task:ui-redesign`, `task:ci-pipeline`, `task:monitoring`
- **Edges**: `manages`, `works-on`, `assigned-to`, `depends-on`, `belongs-to`
- **Properties**: `role`, `status`, `priority`, `created`

Two writers work on this graph — `alice` and `bob` — simulating collaboration between team leads updating the same graph from different machines.

---

## Setting Up the Graph

Before we explore the CLI, we need data. Create a fresh Git repo and populate it with our team graph using the Node.js API:

```javascript
import { WarpGraph, GitGraphAdapter } from '@git-stunts/git-warp';
import Plumbing from '@git-stunts/plumbing';

const plumbing = new Plumbing({ cwd: './team-repo' });
const persistence = new GitGraphAdapter({ plumbing });

// Alice sets up the team structure
const graph = await WarpGraph.open({
  persistence, graphName: 'team', writerId: 'alice',
});

await graph.patch((p) => {
  // People
  p.addNode('user:alice');
  p.setProperty('user:alice', 'name', 'Alice');
  p.setProperty('user:alice', 'role', 'lead');

  p.addNode('user:bob');
  p.setProperty('user:bob', 'name', 'Bob');
  p.setProperty('user:bob', 'role', 'backend');

  p.addNode('user:carol');
  p.setProperty('user:carol', 'name', 'Carol');
  p.setProperty('user:carol', 'role', 'frontend');

  p.addNode('user:dave');
  p.setProperty('user:dave', 'name', 'Dave');
  p.setProperty('user:dave', 'role', 'devops');

  // Projects
  p.addNode('project:api');
  p.setProperty('project:api', 'status', 'active');
  p.addNode('project:dashboard');
  p.setProperty('project:dashboard', 'status', 'active');
  p.addNode('project:infra');
  p.setProperty('project:infra', 'status', 'planning');

  // Management
  p.addEdge('user:alice', 'user:bob', 'manages');
  p.addEdge('user:alice', 'user:carol', 'manages');
  p.addEdge('user:alice', 'user:dave', 'manages');

  // Assignments
  p.addEdge('user:bob', 'project:api', 'works-on');
  p.addEdge('user:carol', 'project:dashboard', 'works-on');
  p.addEdge('user:dave', 'project:infra', 'works-on');
});

// Alice creates tasks and links them
await graph.patch((p) => {
  p.addNode('task:auth');
  p.setProperty('task:auth', 'title', 'Implement OAuth2');
  p.setProperty('task:auth', 'status', 'in-progress');
  p.setProperty('task:auth', 'priority', 'high');

  p.addNode('task:caching');
  p.setProperty('task:caching', 'title', 'Add Redis caching');
  p.setProperty('task:caching', 'status', 'todo');
  p.setProperty('task:caching', 'priority', 'medium');

  p.addNode('task:ui-redesign');
  p.setProperty('task:ui-redesign', 'title', 'Dashboard redesign');
  p.setProperty('task:ui-redesign', 'status', 'in-progress');
  p.setProperty('task:ui-redesign', 'priority', 'high');

  p.addNode('task:ci-pipeline');
  p.setProperty('task:ci-pipeline', 'title', 'Set up CI/CD');
  p.setProperty('task:ci-pipeline', 'status', 'done');
  p.setProperty('task:ci-pipeline', 'priority', 'high');

  p.addNode('task:monitoring');
  p.setProperty('task:monitoring', 'title', 'Production monitoring');
  p.setProperty('task:monitoring', 'status', 'todo');
  p.setProperty('task:monitoring', 'priority', 'low');

  // Task assignments
  p.addEdge('task:auth', 'user:bob', 'assigned-to');
  p.addEdge('task:caching', 'user:bob', 'assigned-to');
  p.addEdge('task:ui-redesign', 'user:carol', 'assigned-to');
  p.addEdge('task:ci-pipeline', 'user:dave', 'assigned-to');
  p.addEdge('task:monitoring', 'user:dave', 'assigned-to');

  // Task → project
  p.addEdge('task:auth', 'project:api', 'belongs-to');
  p.addEdge('task:caching', 'project:api', 'belongs-to');
  p.addEdge('task:ui-redesign', 'project:dashboard', 'belongs-to');
  p.addEdge('task:ci-pipeline', 'project:infra', 'belongs-to');
  p.addEdge('task:monitoring', 'project:infra', 'belongs-to');

  // Dependencies
  p.addEdge('task:caching', 'task:auth', 'depends-on');
  p.addEdge('task:monitoring', 'task:ci-pipeline', 'depends-on');
});

// Bob adds his own updates from his machine
const graphBob = await WarpGraph.open({
  persistence, graphName: 'team', writerId: 'bob',
});

await graphBob.patch((p) => {
  p.setProperty('task:auth', 'status', 'in-review');
  p.setProperty('task:auth', 'reviewer', 'alice');
});
```

Now we have a graph with two writers, 12 nodes, edges of five types, and properties on every node. Let's explore it from the command line.

---

## Inspecting the Repository

### `info` — Summarize graphs in the repo

The first thing to do with any repo is see what's inside.

```bash
git warp info --repo ./team-repo
```

This lists every graph in the repository, with its writer count, patch counts, checkpoint status, and whether a seek cursor is active.

When the repo contains a single graph, `--graph` is optional — it's auto-detected. If the repo holds multiple graphs, you must specify `--graph`.

**Flags:** None beyond [global options](#global-options).

**Example with JSON output:**

```bash
git warp info --repo ./team-repo --json
```

```json
{
  "repo": "/Users/you/team-repo",
  "graphs": [
    {
      "name": "team",
      "writers": { "count": 2, "ids": ["alice", "bob"] },
      "checkpoint": null,
      "coverage": null,
      "writerPatches": { "alice": 2, "bob": 1 },
      "cursor": { "active": false }
    }
  ]
}
```

**With visual output:**

```bash
git warp info --repo ./team-repo --view
```

This renders an ASCII dashboard with writer timelines showing patch distribution.

---

## Querying Nodes and Edges

### `query` — Run a logical graph query

The `query` command is the workhorse of the CLI. It matches nodes by pattern, filters by properties, traverses edges, and selects output fields. Steps are applied left-to-right, each narrowing the working set.

### Matching nodes

Match nodes by glob pattern:

```bash
# All nodes
git warp query --repo ./team-repo

# All users
git warp query --repo ./team-repo --match 'user:*'

# All tasks
git warp query --repo ./team-repo --match 'task:*'

# A specific node
git warp query --repo ./team-repo --match 'user:alice'
```

The default match pattern is `*` (all nodes). Globs support `*` as a wildcard segment — `user:*` matches `user:alice`, `user:bob`, etc.

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--match <glob>` | string | `*` | Glob pattern to match node IDs |

### Filtering by property

Use `--where-prop` to keep only nodes whose properties match. The flag is repeatable — multiple filters use AND logic.

```bash
# All high-priority tasks
git warp query --repo ./team-repo --match 'task:*' --where-prop priority=high

# In-progress tasks with high priority
git warp query --repo ./team-repo --match 'task:*' \
  --where-prop status=in-progress \
  --where-prop priority=high

# All backend engineers
git warp query --repo ./team-repo --match 'user:*' --where-prop role=backend
```

Property comparison is string equality — the value you provide is compared to `String(prop)`.

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--where-prop k=v` | string | _(none)_ | Filter nodes by property equality. Repeatable. |

### Traversing edges

Use `--outgoing` and `--incoming` to follow edges. Each flag moves from the current set of nodes to their neighbors along the specified edge type. The label is optional — omit it to follow all edge types.

```bash
# Who does Alice manage?
git warp query --repo ./team-repo --match 'user:alice' --outgoing manages

# What projects does Bob work on?
git warp query --repo ./team-repo --match 'user:bob' --outgoing works-on

# Which tasks are assigned to Carol?
git warp query --repo ./team-repo --match 'user:carol' --incoming assigned-to

# Who is task:auth assigned to? (follow outgoing assigned-to edge)
git warp query --repo ./team-repo --match 'task:auth' --outgoing assigned-to

# All outgoing edges from Alice (no label filter)
git warp query --repo ./team-repo --match 'user:alice' --outgoing
```

Traversal steps are repeatable and compose left-to-right:

```bash
# Multi-step: Alice → manages → works-on
# "What projects do Alice's reports work on?"
git warp query --repo ./team-repo --match 'user:alice' \
  --outgoing manages \
  --outgoing works-on
```

You can mix traversal steps with property filters. Filters and traversals apply in the order you write them:

```bash
# Alice's reports who are backend engineers, and the projects they work on
git warp query --repo ./team-repo --match 'user:alice' \
  --outgoing manages \
  --where-prop role=backend \
  --outgoing works-on
```

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--outgoing [label]` | string (optional) | _(all labels)_ | Traverse outgoing edges. Repeatable. |
| `--incoming [label]` | string (optional) | _(all labels)_ | Traverse incoming edges. Repeatable. |

### Selecting fields

By default, query results include each node's `id` and `props`. Use `--select` to narrow the output:

```bash
# IDs only
git warp query --repo ./team-repo --match 'user:*' --select id

# Props only
git warp query --repo ./team-repo --match 'task:*' --select props

# Both (explicit default)
git warp query --repo ./team-repo --match 'task:*' --select id,props
```

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--select <fields>` | comma-separated | `id,props` | Fields to include: `id`, `props` |

### Visualization

Query results can be rendered as a graph:

```bash
# ASCII art in the terminal
git warp query --repo ./team-repo --match 'user:*' --view

# SVG file
git warp query --repo ./team-repo --match '*' --view svg:team-graph.svg

# HTML file
git warp query --repo ./team-repo --match '*' --view html:team-graph.html
```

### Complete flag reference for `query`

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--match <glob>` | string | `*` | Glob pattern to match node IDs |
| `--outgoing [label]` | string (optional) | _(all labels)_ | Traverse outgoing edges. Repeatable. |
| `--incoming [label]` | string (optional) | _(all labels)_ | Traverse incoming edges. Repeatable. |
| `--where-prop k=v` | string | _(none)_ | Filter by property equality. Repeatable. |
| `--select <fields>` | comma-separated | `id,props` | Fields to include: `id`, `props` |

---

## Finding Paths

### `path` — Find a shortest path between two nodes

The `path` command uses Dijkstra's algorithm to find the shortest route between two nodes through the graph's edges.

### Basic path finding

```bash
# Does a dependency chain connect task:monitoring to task:ci-pipeline?
git warp path --repo ./team-repo --from task:monitoring --to task:ci-pipeline

# Positional shorthand (same thing)
git warp path --repo ./team-repo task:monitoring task:ci-pipeline
```

When a path is found, the output includes the full node sequence and hop count. When no path exists, it returns `found: false` and exits with code 2 (`NOT_FOUND`).

### Controlling direction

By default, traversal follows outgoing edges only. Use `--dir` to change this:

```bash
# Follow outgoing edges (default)
git warp path --repo ./team-repo --from user:alice --to project:api --dir out

# Follow incoming edges
git warp path --repo ./team-repo --from project:api --to user:alice --dir in

# Ignore direction (treat edges as undirected)
git warp path --repo ./team-repo --from user:bob --to user:carol --dir both
```

### Filtering by edge label

Restrict traversal to specific edge types:

```bash
# Path using only "depends-on" edges
git warp path --repo ./team-repo --from task:monitoring --to task:auth --label depends-on

# Multiple labels (comma-separated or repeated)
git warp path --repo ./team-repo --from user:alice --to project:api \
  --label manages --label works-on

git warp path --repo ./team-repo --from user:alice --to project:api \
  --label "manages,works-on"
```

### Limiting depth

Prevent unbounded traversal in large graphs:

```bash
git warp path --repo ./team-repo --from user:alice --to project:api --max-depth 3
```

### Visualization

```bash
# ASCII path diagram
git warp path --repo ./team-repo --from user:alice --to project:api --view

# SVG output
git warp path --repo ./team-repo --from user:alice --to project:api --view svg:path.svg
```

### Complete flag reference for `path`

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--from <id>` | string | _(required)_ | Start node ID. Also accepted as positional arg 1. |
| `--to <id>` | string | _(required)_ | End node ID. Also accepted as positional arg 2. |
| `--dir <out\|in\|both>` | enum | `out` | Edge traversal direction |
| `--label <label>` | string | _(all labels)_ | Filter by edge label. Repeatable. Comma-separated. |
| `--max-depth <n>` | integer | _(unlimited)_ | Maximum traversal depth |

---

## Reviewing History

### `history` — Show a writer's patch history

Every write to a WARP graph creates a patch — an immutable Git commit. The `history` command lists all patches from a specific writer, showing the Lamport clock tick, commit SHA, and a summary of operations in each patch.

### Basic usage

```bash
# History for the default writer ("cli")
git warp history --repo ./team-repo

# History for a specific writer
git warp history --repo ./team-repo --writer alice
```

Each entry shows the patch SHA, schema version, Lamport timestamp, operation count, and a breakdown of what changed (node adds, edge adds, property sets, etc.).

### Filtering by node

When you're investigating a specific entity, filter the history to only patches that touched it:

```bash
# All patches that modified task:auth (from any writer)
git warp history --repo ./team-repo --writer alice --node task:auth

# Bob's patches involving task:auth
git warp history --repo ./team-repo --writer bob --node task:auth
```

### Visualization

```bash
# Visual timeline
git warp history --repo ./team-repo --writer alice --view
```

The visual timeline renders a vertical patch sequence with color-coded operation indicators: green for adds, red for tombstones, yellow for property changes.

### Complete flag reference for `history`

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--node <id>` | string | _(none)_ | Only show patches that touch this node |

The `--writer` global flag controls which writer's chain to inspect (default: `cli`).

---

## Time Travel

### `seek` — Step through graph history by Lamport tick

The `seek` command lets you navigate through the graph's history. When you set a seek cursor, all subsequent commands (`query`, `info`, `materialize`, `history`) automatically show the graph state at that point in time.

This is one of the most powerful features of the CLI. It's like `git checkout` for your graph data, but non-destructive — it uses a lightweight cursor ref, not working tree changes.

### Discovering available ticks

Run `seek` with no action flags to see the current cursor status and available ticks:

```bash
git warp seek --repo ./team-repo
```

This shows whether a cursor is active, the current tick, the maximum tick, and a breakdown of which ticks each writer contributed.

### Jumping to a tick

```bash
# Jump to tick 1 (Alice's first patch)
git warp seek --repo ./team-repo --tick 1

# Now all commands see state at tick 1
git warp query --repo ./team-repo --match 'task:*'
# Only shows tasks that existed at tick 1 — not Bob's later updates
```

### Relative movement

Step forward or backward from the current position:

```bash
# Step forward one tick
git warp seek --repo ./team-repo --tick=+1

# Step backward two ticks
git warp seek --repo ./team-repo --tick=-2
```

**Note:** Use `=` with signed values (`--tick=+1`, `--tick=-1`) to prevent the shell from interpreting `-` as a flag prefix.

### Seeing what changed

The `--diff` flag shows the structural difference between the target tick and the previous tick — nodes, edges, and properties that were added or removed:

```bash
# What happened at tick 2?
git warp seek --repo ./team-repo --tick 2 --diff

# Step forward and see the diff
git warp seek --repo ./team-repo --tick=+1 --diff
```

For large diffs, limit the output:

```bash
git warp seek --repo ./team-repo --tick 3 --diff --diff-limit 50
```

### Returning to the present

```bash
git warp seek --repo ./team-repo --latest
```

This clears the active cursor. All commands return to showing the current (fully materialized) state.

You can also see the diff when returning:

```bash
git warp seek --repo ./team-repo --latest --diff
```

### Saving and loading positions

Bookmark interesting points in history for quick recall:

```bash
# Save the current position
git warp seek --repo ./team-repo --tick 1
git warp seek --repo ./team-repo --save before-tasks

# Jump somewhere else
git warp seek --repo ./team-repo --tick 3

# Come back to the saved position
git warp seek --repo ./team-repo --load before-tasks

# Load and see what changed since
git warp seek --repo ./team-repo --load before-tasks --diff
```

### Managing saved cursors

```bash
# List all saved cursors
git warp seek --repo ./team-repo --list

# Delete a saved cursor
git warp seek --repo ./team-repo --drop before-tasks
```

### Cache management

Seek caches previously-visited ticks as content-addressed blobs for near-instant restoration. The cache invalidates automatically when new patches arrive.

```bash
# Purge the seek cache
git warp seek --repo ./team-repo --clear-cache

# Bypass cache for a single invocation (enables provenance queries)
git warp seek --repo ./team-repo --no-persistent-cache --tick 2
```

**Important:** When state is restored from cache, provenance queries (`patchesFor`, `materializeSlice`) are unavailable because the provenance index isn't populated. Use `--no-persistent-cache` if you need provenance data at a specific tick.

### Cursor warning

When a seek cursor is active, every command prints a warning to stderr:

```
⚠ seek active (tick 1 of 3) — run "git warp seek --latest" to return to present
```

This prevents you from accidentally analyzing stale state.

### Visualization

```bash
git warp seek --repo ./team-repo --tick 2 --diff --view
```

Renders a seek dashboard with a timeline, tick details, and the structural diff.

### Complete flag reference for `seek`

Only one action flag is allowed per invocation:

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--tick <N\|+N\|-N>` | string | _(none)_ | Jump to absolute tick N, or step +N/-N relative to current |
| `--latest` | boolean | `false` | Clear cursor, return to present |
| `--save <name>` | string | _(none)_ | Save current position as named cursor |
| `--load <name>` | string | _(none)_ | Restore a named saved cursor |
| `--list` | boolean | `false` | List all saved cursors |
| `--drop <name>` | string | _(none)_ | Delete a named cursor |
| `--clear-cache` | boolean | `false` | Purge the persistent seek cache |

Modifier flags (combine with action flags):

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--diff` | boolean | `false` | Show structural diff. Only with `--tick`, `--latest`, or `--load`. |
| `--diff-limit <N>` | integer | `2000` | Max diff entries to display. Requires `--diff`. |
| `--no-persistent-cache` | boolean | `false` | Don't persist/read seek cache for this invocation |

---

## Materializing State

### `materialize` — Build current state and create a checkpoint

Materialization replays all patches from all writers to compute the current graph state, then writes a checkpoint snapshot for fast future recovery.

```bash
# Materialize all graphs in the repo
git warp materialize --repo ./team-repo

# Materialize a specific graph
git warp materialize --repo ./team-repo --graph team
```

The output shows per-graph statistics: node count, edge count, property count, writer contributions, and whether a checkpoint was created.

If a seek cursor is active, materialization respects it — building state only up to the cursor's tick, and skipping checkpoint creation.

**Flags:** None beyond [global options](#global-options).

### When to materialize manually

Most of the time, you don't need to run `materialize` explicitly — commands like `query`, `path`, and `check` materialize automatically when needed. Manual materialization is useful when:

- You want to create a checkpoint after a bulk import
- You're pre-warming state before handing the repo to another process
- You want to see the raw statistics

### Visualization

```bash
git warp materialize --repo ./team-repo --view
```

Shows a dashboard with per-writer patch bars and node/edge/property count gauges.

---

## Health and Diagnostics

### `check` — Report graph health and GC status

The `check` command gives a quick health overview: cache freshness, tombstone ratio, checkpoint age, writer heads, hook status, and coverage.

```bash
git warp check --repo ./team-repo
```

**Flags:** None beyond [global options](#global-options).

### Visualization

```bash
git warp check --repo ./team-repo --view
```

Renders a health dashboard with progress bars for cache freshness and tombstone ratio, color-coded status indicators, and an overall health verdict (HEALTHY, DEGRADED, or UNHEALTHY).

---

### `doctor` — Diagnose structural issues and suggest fixes

The `doctor` command runs a suite of structural checks and produces actionable findings. Think of it as `git fsck` for your WARP graph.

```bash
git warp doctor --repo ./team-repo
```

Each finding has a status (`ok`, `warn`, `fail`), a machine-readable code, an impact category, and — for warnings and failures — a suggested fix.

### Strict mode

By default, warnings don't affect the exit code. In CI or deployment gates, use `--strict` to treat warnings as failures:

```bash
git warp doctor --repo ./team-repo --strict
```

This changes the exit code from 0 to 4 when warnings are present.

### Complete flag reference for `doctor`

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--strict` | boolean | `false` | Treat warnings as failures (exit code 4) |

---

## Verifying Audit Integrity

### `verify-audit` — Verify audit receipt chain integrity

When audit mode is enabled (`audit: true` on `WarpGraph.open()`), every data commit produces a tamper-evident audit receipt stored as a Git commit. The `verify-audit` command walks these chains and checks their integrity.

```bash
# Verify all writers' audit chains
git warp verify-audit --repo ./team-repo

# Verify a single writer
git warp verify-audit --repo ./team-repo --writer alice
```

The verifier checks:
- Receipt schema and field types
- Chain linking (each receipt's `prevAuditCommit` matches its Git parent)
- Tick monotonicity (strictly increasing forward through the chain)
- Trailer-to-CBOR consistency
- Tree structure (exactly one `receipt.cbor` entry per commit)

### Partial verification

For large chains, verify only the most recent segment:

```bash
# Verify from tip down to a specific commit
git warp verify-audit --repo ./team-repo --since abc123def456
```

This is useful for incremental checks in CI — verify only what changed since the last successful check.

### Interpreting results

Exit code 0 means all chains are valid. Exit code 3 means at least one chain has integrity failures. The output includes a summary with total/valid/partial/invalid counts, plus per-chain details with any issues found.

### Complete flag reference for `verify-audit`

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--writer <id>` | string | _(all writers)_ | Verify only this writer's audit chain |
| `--since <commit>` | string | _(genesis)_ | Verify from tip down to this commit (inclusive) |

---

## Interactive Explorer

### `view` — Interactive TUI graph browser

The `view` command launches a full-screen terminal UI for browsing the graph interactively.

```bash
git warp view --repo ./team-repo
```

**Requires** the `@git-stunts/git-warp-tui` peer dependency:

```bash
npm install -g @git-stunts/git-warp-tui
```

The TUI only works in interactive terminals (TTY). Piped or redirected output is not supported.

### Modes

```bash
# Default list mode — browse nodes and edges
git warp view --repo ./team-repo

# Log mode — browse patch history
git warp view --repo ./team-repo --log
```

### Complete flag reference for `view`

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--log` | boolean | `false` | Start in log/history mode instead of list mode |

---

## Git Hook Integration

### `install-hooks` — Install post-merge git hook

The `install-hooks` command sets up a `post-merge` Git hook that detects when warp refs change during `git pull` or `git merge`, and notifies you to re-materialize.

```bash
git warp install-hooks --repo ./team-repo
```

The hook never blocks a merge — it always exits 0. It simply prints a message when warp data has changed.

### Handling existing hooks

If a `post-merge` hook already exists, the installer detects it and offers three options:

1. **Append** — keep your existing hook and add the warp section below it
2. **Replace** — back up the existing hook and install a fresh one
3. **Skip** — leave everything unchanged

These prompts only appear in interactive terminals. In CI or scripts, use `--force`:

```bash
git warp install-hooks --repo ./team-repo --force
```

`--force` replaces any existing hook (backing up the original to `post-merge.backup`).

### Auto-materialize on pull

After installing the hook, enable automatic materialization:

```bash
git config warp.autoMaterialize true
```

Now `git pull` will automatically materialize if warp refs changed.

### Complete flag reference for `install-hooks`

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--force` | boolean | `false` | Replace existing hook without prompting (backs up original) |

---

## Output Formats

Every command supports three output formats, controlled by mutually exclusive flags. Only one can be used at a time.

### Text (default)

Human-readable output with ANSI colors. Colors are automatically stripped when stdout is not a TTY, when `NO_COLOR` is set, or when `CI=true`.

```bash
git warp query --repo ./team-repo --match 'user:*'
```

### JSON (`--json`)

Pretty-printed JSON with sorted keys (2-space indent). Suitable for `jq`, debugging, and readability:

```bash
git warp query --repo ./team-repo --match 'user:*' --json
```

```bash
# Pipe to jq
git warp query --repo ./team-repo --match 'task:*' --json | jq '.nodes | length'
```

### NDJSON (`--ndjson`)

Compact single-line JSON. One object per line, optimized for streaming and scripting:

```bash
git warp history --repo ./team-repo --writer alice --ndjson
```

```bash
# Process each patch
git warp history --repo ./team-repo --writer alice --ndjson \
  | while read -r line; do echo "$line" | jq '.sha'; done
```

### Visual (`--view`)

ASCII visualization in the terminal, or file export. Not all commands support `--view`.

**Supported commands:** `info`, `check`, `history`, `path`, `materialize`, `query`, `seek`

**Modes:**

| Mode | Syntax | Description |
|------|--------|-------------|
| ASCII | `--view` or `--view ascii` | Rendered in the terminal |
| SVG file | `--view svg:filename.svg` | Written to disk as SVG |
| HTML file | `--view html:filename.html` | Written to disk as HTML wrapper around SVG |
| Browser | `--view browser` | Opens in default browser |

```bash
# ASCII in terminal
git warp query --repo ./team-repo --match '*' --view

# Export to SVG
git warp query --repo ./team-repo --match '*' --view svg:team.svg

# Export to HTML
git warp path --repo ./team-repo --from user:alice --to project:api --view html:path.html
```

### Error output

Errors are written to stderr in text mode. With `--json` or `--ndjson`, errors are written to stdout as JSON for machine consumption:

```json
{
  "error": {
    "code": "E_USAGE",
    "message": "Path requires --from and --to (or two positional ids)"
  }
}
```

---

## Global Options

These flags are accepted by every command and can appear before or after the command name.

| Flag | Short | Type | Default | Description |
|------|-------|------|---------|-------------|
| `--repo <path>` | `-r` | string | current directory | Path to the Git repository |
| `--graph <name>` | | string | auto-detect | Graph name. Required if the repo contains multiple graphs. |
| `--writer <id>` | | string | `cli` | Writer ID for commands that need one (e.g., `history`) |
| `--json` | | boolean | `false` | Pretty-printed JSON output |
| `--ndjson` | | boolean | `false` | Compact single-line JSON output |
| `--view [mode]` | | string | _(none)_ | Visual output. Mode: `ascii` (default), `browser`, `svg:FILE`, `html:FILE` |
| `--help` | `-h` | boolean | `false` | Show help text |

**Mutual exclusion:** `--json`, `--ndjson`, and `--view` cannot be combined.

**Auto-detection:** When `--graph` is omitted, the CLI scans for graphs under `refs/warp/`. If exactly one is found, it's used automatically. If zero or more than one are found, the CLI reports an error.

---

## Exit Codes

| Code | Name | Meaning |
|------|------|---------|
| 0 | `OK` | Success |
| 1 | `USAGE` | Invalid arguments, missing required flags, or validation error |
| 2 | `NOT_FOUND` | The requested entity was not found (e.g., no path exists, graph not found) |
| 3 | `INTERNAL` | Unhandled error, or audit chain integrity failure |
| 4 | _(doctor strict)_ | Doctor findings present with `--strict` mode |

Use exit codes in scripts:

```bash
git warp path --repo ./team-repo --from user:alice --to user:bob --json
if [ $? -eq 2 ]; then
  echo "No path found"
fi
```

---

## Command Reference

Quick-reference table of all commands and their flags.

### `info`

| Flag | Description |
|------|-------------|
| _(global only)_ | See [Global Options](#global-options) |

### `query`

| Flag | Description |
|------|-------------|
| `--match <glob>` | Node ID glob pattern (default: `*`) |
| `--outgoing [label]` | Follow outgoing edges. Label optional. Repeatable. |
| `--incoming [label]` | Follow incoming edges. Label optional. Repeatable. |
| `--where-prop k=v` | Filter by property equality. Repeatable. |
| `--select <fields>` | Comma-separated: `id`, `props` |

### `path`

| Flag | Description |
|------|-------------|
| `--from <id>` | Start node (or positional arg 1) |
| `--to <id>` | End node (or positional arg 2) |
| `--dir <out\|in\|both>` | Traversal direction (default: `out`) |
| `--label <label>` | Edge label filter. Repeatable. Comma-separated. |
| `--max-depth <n>` | Maximum traversal depth |

### `history`

| Flag | Description |
|------|-------------|
| `--node <id>` | Filter to patches touching this node |

### `seek`

| Flag | Description |
|------|-------------|
| `--tick <N\|+N\|-N>` | Jump to tick (absolute or relative) |
| `--latest` | Return to present |
| `--save <name>` | Save current position |
| `--load <name>` | Restore saved position |
| `--list` | List saved cursors |
| `--drop <name>` | Delete saved cursor |
| `--clear-cache` | Purge seek cache |
| `--diff` | Show structural diff (with `--tick`, `--latest`, `--load`) |
| `--diff-limit <N>` | Max diff entries (default: 2000, requires `--diff`) |
| `--no-persistent-cache` | Skip cache for this invocation |

### `materialize`

| Flag | Description |
|------|-------------|
| _(global only)_ | See [Global Options](#global-options) |

### `check`

| Flag | Description |
|------|-------------|
| _(global only)_ | See [Global Options](#global-options) |

### `doctor`

| Flag | Description |
|------|-------------|
| `--strict` | Treat warnings as failures (exit 4) |

### `verify-audit`

| Flag | Description |
|------|-------------|
| `--writer <id>` | Verify a single writer's chain |
| `--since <commit>` | Verify from tip down to this commit |

### `view`

| Flag | Description |
|------|-------------|
| `--log` | Start in log mode |

### `install-hooks`

| Flag | Description |
|------|-------------|
| `--force` | Replace existing hook without prompting |
