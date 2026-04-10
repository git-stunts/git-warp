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

You can use `git-warp` directly as a graph database and causal substrate
without adopting Echo, `warp-ttd`, or Continuum. If you do use those sibling
systems, `git-warp` serves as the cold side of that wider stack.

It syncs through normal Git transport. In practice that means `git push`,
`git pull`, and `git fetch` of the relevant WARP refs.

It also stays orthogonal to your normal Git worktrees. Writing graph history
does not rewrite your checked-out files, mutate your source-tree commits, or
otherwise take over the branches you are working in.

In plain terms, `git-warp` is also:

- offline-first
- decentralized
- multi-writer
- CRDT-backed and eventually consistent
- deterministic under replay and materialization
- serverless in the sense that it does not require a central database server
- causal and provenance-preserving by construction

## Start Here

The normal application read path is:

`WarpApp -> Worldline -> Observer -> query()/traverse()/getNodeProps()`

Not:

`materialize everything -> rebuild your own graph -> hope it still matches`

Minimal shape:

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
    .setProperty('user:alice', 'email', 'alice@example.com')
    .addNode('task:auth')
    .setProperty('task:auth', 'title', 'Implement OAuth2')
    .addEdge('task:auth', 'user:alice', 'assigned-to');
});

const worldline = app.worldline();
const publicUsers = await worldline.observer('public-users', {
  match: ['user:*', 'task:*'],
  redact: ['email'],
});

const result = await publicUsers.query()
  .match('user:*')
  .run();
```

Historical and speculative reads use the same surface:

- live truth: `app.worldline()`
- historical coordinate: `app.worldline({ source: { kind: 'coordinate', ... } })`
- speculative lane: `app.worldline({ source: { kind: 'strand', strandId: ... } })`

## Two Mistakes To Avoid

### 1. Do not materialize whole state by reflex

`WarpState` is real, immutable, and useful. It is not the normal starting
point for most applications.

Reach for explicit materialization when you truly need:

- a whole-state detached snapshot
- receipts for substrate/debugger tooling
- checkpointing or replay-grade inspection
- other substrate-level work

For most app logic, start from a `Worldline`, add an `Observer`, and read
through query, traversal, or property methods.

### 2. Do not rebuild your own graph engine on top of `WarpState`

If you materialize a worldline and then model a second graph in your own code
from those results, you are usually throwing away the point of the system:

- pinned historical coordinates
- observer-relative projection
- provenance-bearing reads
- strand-aware speculative views
- lawful causal vocabulary

If you need an application model, derive it from observer surfaces and
explicit domain projections, not from a parallel shadow graph that has to
rediscover history semantics by hand.

## What git-warp Is

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

## Core Nouns

| Term | Meaning |
| --- | --- |
| **WarpApp** | Product-facing root for writing, syncing, worldlines, observers, and strands. |
| **WarpCore** | Plumbing-facing root for replay, provenance, materialization, and tooling. |
| **Worldline** | Canonical admitted causal lane or pinned read coordinate. A worldline is a causal history, not a timeline. |
| **Strand** | Speculative causal lane for durable, forkable, writable non-canonical work. |
| **Observer** | Projection with basis and accumulation over a worldline, strand, or braid. |
| **Aperture** | What the observer preserves, projects, redacts, or coarsens. |
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
Those commits point at Git's empty tree, so graph history stays orthogonal to
normal source-tree history.

That also means ordinary Git transport remains the sync story. `git-warp` does
not require a separate central database server to replicate graph history.
Your checked-out worktrees remain your checked-out worktrees.

## Choose The Right Tool

| Use case | git-warp | Echo | Other | Remarks |
| --- | --- | --- | --- | --- |
| Offline-first collaborative graph app | ✅ | ❌ | **CouchDB / PouchDB** | Strong fit when graph shape, causal history, and later convergence matter. |
| Multi-writer edge / intermittent sync system | ✅ | ❌ | **Event log + custom sync** | Good fit when writers must work independently and converge later. |
| Git-native causal substrate for tools or agents | ✅ | ❌ | **Plain Git + custom files** | Better fit when you want graph semantics, worldlines, provenance, and replay without inventing merge law yourself. |
| High-throughput deterministic execution | ❌ | ✅ | **Traditional ECS / custom runtime** | Echo is the right runtime when hot stepping throughput is the core problem. |
| Cross-host debugger / time-travel tooling | substrate | substrate | **warp-ttd** | `warp-ttd` observes and controls `git-warp` through explicit host capabilities. |
| Centralized OLTP app | ❌ | ❌ | **Postgres** | Use a conventional database. |

## Design Commitments

- Canonical history is never silently rewritten.
- State convergence does not imply provenance convergence.
- Explicit conflict surfacing beats silent erasure.
- Boundary parsing and validation happen at ingress.
- Once a runtime truth is admitted, normal domain code should not keep asking
  if it is valid.
- Shared globally meaningful nouns should converge on canonical contract
  surfaces, not handwritten folklore.

## Strands And Collapse

Strands are not throwaway scratch space. They are speculative causal lanes.

Longer term, strand admission should not mean "promote the whole strand."
The target model is collapse as causal slicing:

- keep the full raw strand history
- derive the relevant causal slice for the admission target
- admit only the lawful canonical provenance slice
- preserve witness information that explains why the admitted result exists

That is how speculative work can stay rich without making canonical history
noisy or dishonest.

## Documentation

Read these in roughly this order:

- [Getting Started](docs/GETTING_STARTED.md): first successful open, write,
  worldline, observer, and sync flow
- [Guide](docs/GUIDE.md): normal builder patterns for apps, agents, and local
  tools
- [API Reference](docs/API_REFERENCE.md): exhaustive public API
- [Advanced Guide](docs/ADVANCED_GUIDE.md): substrate internals, replay,
  trust, and performance
- [CLI Guide](docs/CLI_GUIDE.md): terminal workflows
- [Conceptual Overview](docs/CONCEPTUAL_OVERVIEW.md): WARP mental model and
  Git substrate story
- [Architecture](docs/ARCHITECTURE.md): layering and internal structure
- [Vision](docs/VISION.md): current repo doctrine
- [Documentation index](docs/README.md): full docs map

## Short Version

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
