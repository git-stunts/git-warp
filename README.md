<div align="center">
  <img src="https://raw.githubusercontent.com/git-stunts/git-warp/main/docs/images/git-warp-alt.svg" alt="git-warp logo" />
  <h1><code>git-warp</code>: the cold causal substrate on top of Git</h1>
  <p>Offline-first, decentralized, multi-writer, deterministic, eventually consistent causal graph storage with observer-first reads.</p>
</div>

[![CI](https://github.com/git-stunts/git-warp/actions/workflows/ci.yml/badge.svg)](https://github.com/git-stunts/git-warp/actions/workflows/ci.yml) [![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0) [![npm version](https://badge.fury.io/js/%40git-stunts%2Fgit-warp.svg)](https://www.npmjs.com/package/@git-stunts%2Fgit-warp)

`git-warp` stores causal graph history in Git objects and refs. Writes become
patch commits. Reads happen through worldlines, strands, and observers.
Provenance, replay, and explicit historical coordinates are part of the model,
not bolted-on afterthoughts.

Distributed, conflict-free graph storage that lives orthogonally to your source tree.

## What git-warp is

`git-warp` is a Git-native implementation of WARP: Worldline Algebra for
Recursive Provenance.

At the repo-truth level, it is:

- a cold causal substrate
- append-only by design
- multi-writer without per-write coordination
- deterministic under replay and materialization
- explicit about provenance, receipts, and history
- built around canonical and speculative causal lanes

It is not:

- a generic OLTP database
- a warehouse
- a search engine
- the hot execution runtime
- a debugger UI
- a license to silently collapse conflict or provenance information

## When to use it

Reach for `git-warp` when:

- you need offline-first multi-writer convergence
- causal history and provenance matter to your domain
- you want graph semantics without inventing your own merge law
- you are building tooling, agents, or automation that needs substrate truth
- you want sync through normal Git transport without a central server

## When not to use it

Do not reach for `git-warp` when:

- you need high-throughput real-time execution (use Echo instead)
- you need a general-purpose OLTP database (use Postgres)
- you need full-text search or analytics (use purpose-built engines)
- you need a debugger UI (use warp-ttd on top of git-warp)

## Architecture at a glance

`git-warp` exposes two public surfaces over one hexagonal Git-backed engine:

- `WarpApp` — the product-facing surface for writes, reads, worldlines, and strands
- `WarpCore` — the substrate surface for replay, provenance, inspection, and tooling

Under both surfaces, the implementation runs through one internal engine in
`src/domain/`. The domain does no I/O directly. All storage, crypto, clock, and
logging go through ports. Adapters wire those ports to Git, the filesystem,
Node, Bun, Deno, or the browser.

## Core nouns

| Term | Meaning |
| --- | --- |
| **WarpApp** | Product-facing root for writing, syncing, worldlines, observers, and strands. |
| **WarpCore** | Plumbing-facing root for replay, provenance, materialization, and tooling. |
| **Worldline** | Canonical admitted causal lane or pinned read coordinate. A worldline is a causal history, not a timeline. |
| **Strand** | A speculative write lane branched from a base observation. |
| **Observer** | A filtered, read-only projection over a worldline through an aperture. |
| **Aperture** | The aperture definition that shapes what an observer can see. |
| **Braid** | Composite read presentation across multiple lanes. |
| **WarpState** | Immutable materialized whole-state value. Real and useful, but not the center of the normal app API. |
| **Receipt** | Provenance-bearing operational record, richer than the minimum witness needed for local reversibility. |

## Why Git

Git and WARP fit together unusually well:

- both are append-only in spirit
- both rely on content-addressed artifacts
- both work in distributed multi-writer environments
- both preserve history instead of pretending it never happened

Each writer appends patch commits under `refs/warp/<graph>/writers/<writerId>`.
Those commits point at Git's well-known empty tree (`4b825dc642cb6eb9a060e54bf8d69288fbee4904`),
so graph history stays orthogonal to normal source-tree history.

That also means ordinary Git transport remains the sync story. `git-warp` does
not require a separate central database server to replicate graph history.
Your checked-out worktrees remain your checked-out worktrees.

## Choose the right tool

| Use case | git-warp | Echo | Other | Remarks |
| --- | --- | --- | --- | --- |
| Offline-first collaborative app | ✅ | ❌ | **CouchDB / PouchDB** | Strong fit when graph shape, causal history, and later convergence matter. |
| Multi-writer edge / intermittent sync system | ✅ | ❌ | **Event log + custom sync** | Good fit when writers must work independently and converge later. |
| Git-native causal substrate for tools or agents | ✅ | ❌ | **Plain Git + custom files** | Better fit when you want graph semantics, worldlines, provenance, and replay without inventing merge law yourself. |
| High-performance realtime simulation or game loop | ❌ | ✅ | **Traditional ECS / custom runtime** | Echo is the right runtime when hot stepping throughput is the core problem. |
| Cross-host debugger / time-travel tooling | substrate | substrate | **warp-ttd** | `warp-ttd` observes and controls `git-warp` through explicit host capabilities. |
| Centralized OLTP app | ❌ | ❌ | **Postgres** | Use a conventional database. |

## Strands and collapse

Strands are not throwaway scratch space. They are speculative causal lanes.

Longer term, strand admission should not mean "promote the whole strand."
The target model is collapse as causal slicing:

- keep the full raw strand history
- derive the relevant causal slice for the admission target
- admit only the lawful canonical provenance slice
- preserve witness information that explains why the admitted result exists

That is how speculative work can stay rich without making canonical history
noisy or dishonest.

## Documentation pipeline

Read these in roughly this order:

- [Getting Started](https://github.com/git-stunts/git-warp/blob/main/docs/GETTING_STARTED.md): first successful open, write,
  worldline, observer, and sync flow
- [Guide](https://github.com/git-stunts/git-warp/blob/main/docs/GUIDE.md): normal builder patterns for apps, agents, and local
  tools
- [API Reference](https://github.com/git-stunts/git-warp/blob/main/docs/API_REFERENCE.md): exhaustive public API
- [Advanced Guide](https://github.com/git-stunts/git-warp/blob/main/docs/ADVANCED_GUIDE.md): substrate internals, replay,
  trust, and performance
- [CLI Guide](https://github.com/git-stunts/git-warp/blob/main/docs/CLI_GUIDE.md): terminal workflows
- [Conceptual Overview](https://github.com/git-stunts/git-warp/blob/main/docs/CONCEPTUAL_OVERVIEW.md): WARP mental model and
  Git substrate story
- [Architecture](https://github.com/git-stunts/git-warp/blob/main/docs/ARCHITECTURE.md): layering and internal structure
- [Vision](https://github.com/git-stunts/git-warp/blob/main/docs/VISION.md): current repo doctrine
- [Specs](https://github.com/git-stunts/git-warp/tree/main/docs/specs): normative protocol and format specifications
- **[Documentation index](https://github.com/git-stunts/git-warp/blob/main/docs/README.md)**

## Short version

- use `Worldline` and `Observer` for most reads
- use `Strand` for speculative work
- use `WarpState` when you really need whole-state substrate truth
- keep provenance and receipts explicit
- do not rebuild your own shadow graph engine unless you enjoy sludge

## License

Apache-2.0

---

<p align="center">
<sub>Built by <a href="https://github.com/flyingrobots">FLYING ROBOTS</a></sub>
</p>
