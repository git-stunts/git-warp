# git warp CLI guide

This guide teaches the current `warp-graph` / `git warp` CLI surface.

Use the CLI when you want to:

- inspect a graph repository
- query and traverse graph state
- inspect history, seek through time, or debug provenance
- work with strands
- verify or maintain repository health

If you are building an application, start with `WarpApp` and the main [Guide](GUIDE.md). The CLI is the operational and inspection surface.

## Install and invoke the CLI

Install the package:

```bash
npm install @git-stunts/git-warp @git-stunts/plumbing
```

You can invoke the CLI in two equivalent ways:

```bash
# direct binary
npx warp-graph <command> [options]

# Git subcommand wrapper
npm run install:git-warp
git warp <command> [options]
```

This guide uses `git warp` in examples.

## Create a sample graph

The CLI assumes you already have a repository with graph data. The fastest way to seed one is with the API.

```javascript
import GitPlumbing from '@git-stunts/plumbing';
import WarpApp, { GitGraphAdapter } from '@git-stunts/git-warp';

const plumbing = new GitPlumbing({ cwd: './team-repo' });
const persistence = new GitGraphAdapter({ plumbing });

const app = await WarpApp.open({
  persistence,
  graphName: 'team',
  writerId: 'alice',
});

await app.patch((p) => {
  p.addNode('user:alice')
    .setProperty('user:alice', 'name', 'Alice')
    .setProperty('user:alice', 'role', 'lead')
    .addNode('user:bob')
    .setProperty('user:bob', 'name', 'Bob')
    .setProperty('user:bob', 'role', 'backend')
    .addNode('task:auth')
    .setProperty('task:auth', 'title', 'Implement OAuth2')
    .setProperty('task:auth', 'status', 'in-progress')
    .addEdge('task:auth', 'user:bob', 'assigned-to')
    .addEdge('user:alice', 'user:bob', 'manages');
});

await app.patch((p) => {
  p.addNode('task:review')
    .setProperty('task:review', 'status', 'todo')
    .addEdge('task:review', 'task:auth', 'depends-on');
});
```

Everything below assumes this repo exists at `./team-repo`.

## Inspect the repository

Start with `info` when you want a quick summary:

```bash
git warp info --repo ./team-repo
```

Useful variants:

```bash
git warp info --repo ./team-repo --json
git warp info --repo ./team-repo --view
```

Use `history` when you want the writer-local patch timeline:

```bash
git warp history --repo ./team-repo
git warp history --repo ./team-repo --node task:auth
```

## Query and traverse graph state

Use `query` for logical matching and filtering:

```bash
git warp query --repo ./team-repo --match 'task:*'
git warp query --repo ./team-repo --match 'task:*' --where-prop status=in-progress
git warp query --repo ./team-repo --match 'user:*' --outgoing manages
```

Use `path` when you want a directed route between two nodes:

```bash
git warp path --repo ./team-repo --from task:review --to user:bob --dir out
```

Use `tree` when you want a visual traversal:

```bash
git warp tree task:review --repo ./team-repo --edge depends-on --prop status
```

These are state-level read commands. They are great for inspection, automation, and scripts. For product code, prefer `WarpApp`, `Worldline`, `Lens`, and `Observer`.

## Seek through history

Use `seek` to move the active read cursor through Lamport history:

```bash
git warp seek --repo ./team-repo --tick -1
git warp seek --repo ./team-repo --tick 12
git warp seek --repo ./team-repo --tick -1 --diff
git warp seek --repo ./team-repo --latest
```

Saved cursors are useful when you revisit the same positions:

```bash
git warp seek --repo ./team-repo --save before-review
git warp seek --repo ./team-repo --list
git warp seek --repo ./team-repo --load before-review
git warp seek --repo ./team-repo --drop before-review
```

`seek` changes the CLI’s active observation position. It does not mutate graph truth.

## Work with strands

Use `strand` when you want a durable speculative lane pinned to an explicit observation.

Create a strand:

```bash
git warp strand create --repo ./team-repo --id review-auth --owner alice --scope "OAuth review"
```

Inspect or list strands:

```bash
git warp strand list --repo ./team-repo
git warp strand show review-auth --repo ./team-repo
```

Braid read-only support overlays into a target strand:

```bash
git warp strand braid review-auth --repo ./team-repo --support peer-review --read-only
```

Materialize or compare a strand:

```bash
git warp strand materialize review-auth --repo ./team-repo
git warp strand materialize review-auth --repo ./team-repo --receipts
git warp strand compare review-auth --repo ./team-repo --against live
git warp strand compare review-auth --repo ./team-repo --against strand:peer-review
```

Plan transfer without mutating either side:

```bash
git warp strand transfer-plan review-auth --repo ./team-repo --into live
```

Drop the descriptor when you are done:

```bash
git warp strand drop review-auth --repo ./team-repo
```

Use strands for durable speculative coordinates. Use `seek` for temporary cursor movement.

## Use debugger and substrate inspection commands

The `debug` family is the thin CLI-first TTD surface over `WarpCore`.

Inspect the current coordinate:

```bash
git warp debug coordinate --repo ./team-repo
git warp debug coordinate --repo ./team-repo --lamport-ceiling 12
```

Inspect timelines, conflicts, provenance, and receipts:

```bash
git warp debug timeline --repo ./team-repo --entity-id task:auth
git warp debug conflicts --repo ./team-repo --entity-id task:auth
git warp debug provenance --repo ./team-repo --entity-id task:auth
git warp debug receipts --repo ./team-repo --limit 20
```

These commands also support strand-backed inspection where appropriate:

```bash
git warp debug timeline --repo ./team-repo --strand review-auth
git warp debug conflicts --repo ./team-repo --strand review-auth --entity-id task:auth
git warp debug receipts --repo ./team-repo --strand review-auth
```

Raw patch inspection stays separate:

```bash
git warp patch list --repo ./team-repo --limit 10
git warp patch show <patch-sha> --repo ./team-repo
```

Explicit whole-state replay is also available:

```bash
git warp materialize --repo ./team-repo
```

Treat `materialize` as advanced substrate inspection, not the default app read path.

## Validate and maintain a repository

Health and structural diagnostics:

```bash
git warp check --repo ./team-repo
git warp doctor --repo ./team-repo
git warp doctor --repo ./team-repo --strict
```

Audit, trust, and index integrity:

```bash
git warp verify-audit --repo ./team-repo
git warp trust --repo ./team-repo
git warp verify-index --repo ./team-repo
git warp reindex --repo ./team-repo
```

History investigation and regression hunting:

```bash
git warp bisect --repo ./team-repo --writer alice --good <sha> --bad <sha> --test "npm test"
```

Git hook integration:

```bash
git warp install-hooks --repo ./team-repo
git warp install-hooks --repo ./team-repo --force
```

## Output modes and global flags

Global flags work across the command surface:

| Flag | What it does |
| --- | --- |
| `--repo <path>` | Choose the Git repository. Defaults to the current working directory. |
| `--graph <name>` | Select a graph when the repo contains more than one. |
| `--writer <id>` | Set the writer ID for commands that need one. |
| `--json` | Emit structured JSON. |
| `--ndjson` | Emit newline-delimited JSON for pipelines. |
| `--view [mode]` | Emit visual output such as ASCII, SVG, or HTML where supported. |
| `-h`, `--help` | Show the built-in command help. |

When you need the exact current flags for a specific command, use:

```bash
git warp <command> --help
```

## Command reference

This table is the high-level map of the shipped CLI surface.

| Command | Use it for | Notable flags |
| --- | --- | --- |
| `info` | Summarize graphs in a repo | `--json`, `--view` |
| `query` | Match/filter nodes and follow edges | `--match`, `--where-prop`, `--outgoing`, `--incoming` |
| `path` | Find a directed path between two nodes | `--from`, `--to`, `--dir`, `--label`, `--max-depth` |
| `tree` | Render an ASCII traversal rooted at a node | `--edge`, `--prop`, `--max-depth` |
| `history` | Show writer-local patch history | `--node` |
| `seek` | Move the active historical cursor | `--tick`, `--latest`, `--save`, `--load`, `--list`, `--drop`, `--diff` |
| `strand create` | Create a durable speculative lane | `--id`, `--lamport-ceiling`, `--owner`, `--scope` |
| `strand list` / `show` | Inspect strand descriptors | `show <id>` |
| `strand braid` | Pin support overlays onto a target strand | `<id>`, `--support`, `--read-only`, `--writable` |
| `strand materialize` | Replay one strand’s pinned observation | `<id>`, `--receipts` |
| `strand compare` | Compare a strand to live, base, or another strand | `<id>`, `--against`, `--target-id`, `--lamport-ceiling` |
| `strand transfer-plan` | Extract a deterministic candidate transfer | `<id>`, `--into`, `--lamport-ceiling` |
| `strand drop` | Delete a strand descriptor | `<id>` |
| `debug coordinate` | Inspect the resolved observation coordinate | `--lamport-ceiling` |
| `debug timeline` | Inspect causal patch timelines | `--strand`, `--entity-id`, `--writer-id`, `--limit` |
| `debug conflicts` | Inspect deterministic conflict traces | `--strand`, `--entity-id`, `--kind`, `--evidence` |
| `debug provenance` | Trace which patches affected an entity | `--strand`, `--entity-id`, `--max-patches` |
| `debug receipts` | Inspect reducer tick outcomes | `--strand`, `--writer-id`, `--patch`, `--limit` |
| `patch list` / `show` | Inspect raw committed patches | `--writer`, `--limit`, `show <sha>` |
| `materialize` | Explicit replay/checkpoint inspection | repo/global flags |
| `check` | Report health and GC status | repo/global flags |
| `doctor` | Diagnose structural problems | `--strict` |
| `verify-audit` | Verify audit receipt integrity | `--writer`, `--since`, `--trust-mode`, `--trust-pin` |
| `verify-index` | Sample-check bitmap index integrity | `--seed`, `--sample-rate` |
| `reindex` | Force a full index rebuild | repo/global flags |
| `trust` | Evaluate signed writer trust | `--mode`, `--trust-pin` |
| `bisect` | Find the first bad patch in a writer chain | `--writer`, `--good`, `--bad`, `--test` |
| `install-hooks` | Install the Git hook integration | `--force` |

## How to think about the CLI surface

The CLI has three jobs:

- operational inspection of live graph state
- substrate inspection of history, replay, and provenance
- maintenance and trust tooling

It is not the primary application authoring model. For application code, use `WarpApp`. For explicit replay and tooling integration, think in terms of `WarpCore`.
