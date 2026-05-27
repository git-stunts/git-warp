<div align="center">
  <img src="https://raw.githubusercontent.com/git-stunts/git-warp/main/docs/images/git-warp-alt.svg" alt="git-warp logo" />
  <h1><code>git-warp</code></h1>
  <p>A recursive witnessed admission architecture over Git.</p>
</div>

[![CI](https://github.com/git-stunts/git-warp/actions/workflows/ci.yml/badge.svg)](https://github.com/git-stunts/git-warp/actions/workflows/ci.yml) [![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0) [![npm version](https://badge.fury.io/js/%40git-stunts%2Fgit-warp.svg)](https://www.npmjs.com/package/@git-stunts%2Fgit-warp)

`git-warp` commits truth and reveals truth through bounded worldlines.

It stores causal graph history in Git objects and refs. Writes are
admitted through patches. Reads happen through worldlines, strands,
and observers. Provenance, replay, and explicit historical coordinates
are part of the model.

## Quick start

```typescript
import { GitGraphAdapter, openWarpWorldline } from '@git-stunts/git-warp';
import GitPlumbing from '@git-stunts/plumbing';

const plumbing = new GitPlumbing({ cwd: '.' });
const persistence = new GitGraphAdapter({ plumbing });

const events = await openWarpWorldline({
  persistence,
  worldlineName: 'events',
  writerId: 'agent-1',
});

// Commit: admit a claim into shared causal reality
await events.commit((patch) => {
  patch.addNode('user:alice').setProperty('user:alice', 'role', 'admin');
});

// Reveal: read the admitted truth through a live worldline
const props = await events.live().getNodeProps('user:alice');
```

## What git-warp is

`git-warp` is a Git-native implementation of WARP: Worldline Algebra
for Recursive Provenance.

- **Offline-first** — writers work independently, converge later
- **Multi-writer** — each writer owns its own ref, no coordination
- **Append-only** — history is never rewritten
- **Deterministic** — same patches, any order, same visible state
- **Provenance-complete** — every value traces to exactly one producing patch
- **Speculative** — strands are causal lanes for counterfactual work
- **Observable** — worldlines, observers, and apertures shape what you see

## The admission architecture

The product-facing surface starts with `openWarpWorldline()`. A worldline is a
named admitted causal lane with one writer identity and a small public handle:

| Handle method | Moment | What it does |
|---------------|--------|--------------|
| `commit()` | Commitment | Admits a patch into the named worldline |
| `live()` | Revelation | Reads the latest visible state |
| `seek()` | Historical revelation | Reads a bounded historical coordinate |
| `observer()` | Bounded revelation | Creates an observer through an aperture |
| `prepareOpticBasis()` | Folding | Creates the checkpoint-tail evidence needed by coordinate Optics |
| `coordinate()` | Revelation | Captures a stable coordinate for coherent optic reads |
| `optic()` | Bounded optic work | Starts one-off live optic-shaped reads over the worldline |

For coherent Optics, prepare the bounded basis, capture a coordinate, and read
through that coordinate:

```typescript
await events.prepareOpticBasis();
const coordinate = await events.coordinate();
const role = await coordinate.optic().node('user:alice').prop('role').read();
```

Advanced tooling can still open the lower-level capability bag with
`openWarpGraph()`. That surface is supported for compatibility, diagnostics,
substrate operations, and migration evidence. New application code should prefer
Worldlines and Optics unless it is deliberately working on those lower layers.

`openWarpGraph()` is organized around four architectural moments:

| Moment | Capabilities | What it does |
|--------|-------------|--------------|
| **Commitment** | `patches`, `strands`, `comparison` | Admits claims into frontier-relative truth |
| **Folding** | `checkpoint` | Re-expresses admitted history as operational artifacts |
| **Revelation** | `query`, `subscriptions`, `provenance` | Exposes admitted truth under bounded rights |
| **Governance** | `sync` | Transports and admits remote suffixes |

## Core nouns

| Term | Meaning |
|------|---------|
| **Worldline** | Canonical admitted causal lane. The shared truth others may rely on. |
| **Coordinate** | Stable causal read position used by coherent Optics. |
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
- **[Readings & Optics](docs/READINGS_AND_OPTICS.md)** — public read model and app-facing read patterns
- **[Guide](docs/GUIDE.md)** — patterns for apps, agents, and tools
- **[API Reference](docs/API_REFERENCE.md)** — exhaustive public API
- **[Architecture](docs/ARCHITECTURE.md)** — hexagonal layers and admission kernel
- **[Migration Guide](docs/migrations/v18.0.0.md)** — Worldline-first v18 API migration
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
