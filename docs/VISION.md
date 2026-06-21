# VISION

Status: current truth for `git-warp`.

Scope note:

- `VISION` is the directional north star for what `git-warp` is for.
- For canonical noun meanings, use [GLOSSARY.md](GLOSSARY.md).
- For the current observer/read-side architecture ladder, use
  [0035-observer-geometry-architecture-ladder.md](design/0035-observer-geometry-architecture-ladder.md).
- For later-major horizon planning, use
  [release-horizon-v20-v21.md](design/release-horizon-v20-v21.md).
- For current position and tensions at the cycle boundary, use
  [BEARING.md](BEARING.md).

## One sentence

`git-warp` is a recursive, witnessed admission architecture over
bounded frontier-relative causal sites, built on Git.

## Thesis

WARP repeatedly decides what may become shared causal reality, what
may remain plural, what must be blocked, and why. That decision —
admission — recurs at every scale:

- **Local tick**: a patch's operations are admitted into state under
  CRDT coexistence rules, producing a receipt that witnesses the
  outcome.
- **Braid-local**: multiple speculative lanes are compared over a
  common basis, and a collapse policy derives a result — or
  preserves plurality as the lawful outcome.
- **Distributed**: a remote suffix is transported to a common basis
  and admitted under import policy, with provenance of the transport
  path.

The architecture decomposes into three moments:

- **Commitment** — plural claims are admitted into frontier-relative truth
- **Folding** — admitted history is re-expressed in boundary-equivalent form
- **Revelation** — admitted truth is exposed under bounded rights

The public API prefers flat capability aliases for ordinary code:
`graph.patches`, `graph.query`, and `graph.checkpoint`. Moment-scoped names
remain available when architectural explicitness matters:
`graph.commitment.patches`, `graph.revelation.query`, and
`graph.folding.checkpoint`. They are aliases for the same runtime objects, not
separate APIs.

The read-side correction now matters just as much as the admission-side one:

- the substrate is witnessed causal history, not a canonical materialized graph
- observers should become lawful read objects rather than “filtered snapshot”
  aliases
- the long-term runtime should answer local questions through bounded support,
  indexes, and reusable support fragments instead of defaulting to whole-state
  materialization

## What git-warp owns

- Offline-first graph storage without a central server
- Append-only causal history on Git's content-addressed substrate
- Multi-writer convergence through CRDTs (OR-Set, LWW, Version Vectors)
- Deterministic replay and materialization
- Provenance-complete boundary artifacts (receipts, BTRs)
- Speculative causal lanes (strands) with fork provenance
- Observer-first read surfaces through worldlines and apertures
- Decentralized sync through Git transport

In other words: `git-warp` is a complete Continuum participant for witnessed
causal history, append-only Git-backed persistence, and lawful read/folding
surfaces. It should not have to pretend that a giant in-memory graph is the
ontology.

## What git-warp does not own

- Echo's runtime-local deterministic execution → Echo
- Time-travel debugging UI → warp-ttd
- Shared schemas and contract surfaces → Wesley
- Application domain semantics → yours

## The Git substrate

Git and WARP share deep structural alignment:

- Both are append-only
- Both are content-addressed
- Both are distributed and multi-writer
- Both preserve history as a first-class concern

Each writer appends patch commits under
`refs/warp/<graph>/writers/<writerId>`. Commits point at Git's empty
tree so graph history stays orthogonal to normal source-tree history.
Sync is just `git push` / `git fetch` of WARP refs.

## The Continuum horizon

When used in the wider stack, `git-warp` and Echo are sibling Continuum
participants. Continuum is the protocol for exchanging witnessed causal
history, not a runtime hierarchy. The Continuum vision (Paper VII §5) reframes
processes as strands whose live realization is a shadow working set over
shared machine history:

- **Ephemeral scratch** — local, weakly retained, disposable
- **Author-only speculative lane** — durable, replayable, sealed
- **Shared / admitted lane** — collaborative truth

This three-tier thinking room is the privacy model that makes
provenance-complete collaboration socially viable.

## Current architectural ladder

The runtime is not finished just because the doctrine is clearer.

The current major-version ladder is:

- `v18.0.0`: make the graph substrate honest, including bounded-memory normal
  public reads, writes, content lookup, and sync
- `v19.0.0`: make observer/runtime doctrine honest beyond the v18 bounded
  public-path gate
- `v20.0.0`: make broader slice-first read execution ordinary runtime behavior
- `v21.0.0`: make distributed/plural admission semantics runtime-real

V18 is blocked by two gates:

- first-use Optics setup must not call full graph materialization;
- git-warp must prove normal public API use against a graph larger than its
  configured memory budget.

## Work tracking

GitHub Issues are the live Method tracker. Repository docs remain evidence:
design docs explain planned work, migration maps preserve provenance, and
archived backlog cards are historical source material rather than an active
planning lane.

The canonical articulation of that ladder lives in:

- [0035-observer-geometry-architecture-ladder.md](design/0035-observer-geometry-architecture-ladder.md)
- [release-horizon-v20-v21.md](design/release-horizon-v20-v21.md)

## Engineering doctrine

- **Systems-Style TypeScript (SSTS)** — `docs/SYSTEMS_STYLE_TYPESCRIPT.md`
- **Hexagonal architecture** — domain never imports infrastructure
- **Runtime truth wins** — types document the runtime, not the other way around
- **One file per concept** — each class lives in a file named after it
- **500 LOC max** — larger files are gods and must be decomposed
- **Tests are the spec** — documentation drifts, tests fail loud
- **Zero tolerance** — zero tsc errors, zero lint errors, zero test failures
