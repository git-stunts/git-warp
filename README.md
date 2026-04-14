<div align="center">
  <img src="https://raw.githubusercontent.com/git-stunts/git-warp/main/docs/images/git-warp-alt.svg" alt="git-warp logo" />
  <h1><code>git-warp</code></h1>
  <p>A recursive witnessed admission architecture over Git.</p>
</div>

[![CI](https://github.com/git-stunts/git-warp/actions/workflows/ci.yml/badge.svg)](https://github.com/git-stunts/git-warp/actions/workflows/ci.yml) [![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0) [![npm version](https://badge.fury.io/js/%40git-stunts%2Fgit-warp.svg)](https://www.npmjs.com/package/@git-stunts%2Fgit-warp)

`git-warp` commits truth, folds truth, and reveals truth under law.

It stores causal graph history in Git objects and refs. Writes are
admitted through patches. Reads happen through worldlines, strands,
and observers. Provenance, replay, and explicit historical coordinates
are part of the model, not bolted-on afterthoughts.

## Quick start

```typescript
import { openWarpGraph } from '@git-stunts/git-warp';
import GitPlumbing from '@git-stunts/plumbing';
import { GitGraphAdapter } from '@git-stunts/git-warp';

const plumbing = new GitPlumbing({ cwd: '.' });
const persistence = new GitGraphAdapter({ plumbing });

const graph = await openWarpGraph({
  persistence,
  graphName: 'events',
  writerId: 'agent-1',
});

// Commit: admit a claim into shared causal reality
const patch = await graph.patches.createPatch();
patch.addNode('user:alice').setProperty('user:alice', 'role', 'admin');
await patch.commit();

// Fold: materialize state at the current frontier
await graph.materialize.materialize({});

// Reveal: query the admitted truth
const props = await graph.query.getNodeProps('user:alice');
```

## What git-warp is

`git-warp` is a Git-native implementation of WARP: Worldline Algebra
for Recursive Provenance.

- **Offline-first** — writers work independently, converge later
- **Multi-writer** — each writer owns its own ref, no coordination
- **Append-only** — history is never rewritten
- **Deterministic** — same patches, any order, same materialized state
- **Provenance-complete** — every value traces to exactly one producing patch
- **Speculative** — strands are causal lanes for counterfactual work
- **Observable** — worldlines, observers, and apertures shape what you see

## The admission architecture

`openWarpGraph()` returns a frozen capability bag organized around
three architectural moments:

| Moment | Capabilities | What it does |
|--------|-------------|--------------|
| **Commitment** | `patches`, `strands`, `comparison` | Admits claims into frontier-relative truth |
| **Folding** | `materialize`, `checkpoint` | Re-expresses admitted history in boundary-equivalent form |
| **Revelation** | `query`, `subscriptions`, `provenance` | Exposes admitted truth under bounded rights |
| **Governance** | `sync` | Transports and admits remote suffixes |

## Core nouns

| Term | Meaning |
|------|---------|
| **Worldline** | Canonical admitted causal lane. The shared truth others may rely on. |
| **Strand** | Speculative causal lane with fork provenance. Private until admitted. |
| **Braid** | Plural composition over a family of lanes. Not itself a lane. |
| **Observer** | Filtered read-only projection through an aperture. |
| **Aperture** | The boundary that shapes what an observer can see. |
| **Patch** | A claim: a set of operations over a bounded causal site. |
| **Receipt** | Provenance-bearing witness of an admission outcome. |

## Why Git

Git and WARP fit together because both are:

- append-only in spirit
- content-addressed
- distributed and multi-writer
- history-preserving

Each writer appends patch commits under `refs/warp/<graph>/writers/<writerId>`.
Commits point at Git's empty tree — graph history stays orthogonal to
your source tree. Sync happens through normal `git push` / `git fetch`.

## When to use it

| Use case | Fit |
|----------|-----|
| Offline-first multi-writer convergence | Strong |
| Agent/tool substrate with causal history | Strong |
| Graph semantics without inventing merge law | Strong |
| Speculative lanes for what-if exploration | Strong |
| High-throughput real-time execution | Use Echo instead |
| General-purpose OLTP | Use Postgres |
| Full-text search / analytics | Use purpose-built engines |
| Time-travel debugging UI | Use warp-ttd on top of git-warp |

## Documentation

- **[Getting Started](docs/GETTING_STARTED.md)** — first open, write, read, sync
- **[Guide](docs/GUIDE.md)** — patterns for apps, agents, and tools
- **[API Reference](docs/API_REFERENCE.md)** — exhaustive public API
- **[Architecture](docs/ARCHITECTURE.md)** — hexagonal layers and admission kernel
- **[Migration Guide](docs/migrations/v17.0.0.md)** — upgrading from v16
- **[CLI Guide](docs/CLI_GUIDE.md)** — terminal workflows
- **[Vision](docs/VISION.md)** — repo doctrine
- **[Specs](docs/specs/)** — normative protocol and format specifications

## Substrate stack

`git-warp` is part of the `@git-stunts` substrate:

| Package | Role |
|---------|------|
| `@git-stunts/plumbing` | Git operations |
| `@git-stunts/git-cas` | Content-addressable storage with dedup |
| `@git-stunts/alfred` | Resilience (retry, timeout, circuit breaker) |
| `@git-stunts/trailer-codec` | Commit message trailers |
| `@git-stunts/vault` | Secrets management via OS keychain |

## License

Apache-2.0

---

<p align="center">
<sub>Built by <a href="https://github.com/flyingrobots">FLYING ROBOTS</a></sub>
</p>
