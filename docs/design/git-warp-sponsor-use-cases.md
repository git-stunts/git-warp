# IBM Design Thinking: Sponsor Use Cases For `git-warp`

Status: DESIGN

Legend: Observer Geometry

Cycle: OG-010

## Purpose

This note extends the IBM Design Thinking pass for `git-warp` by making the
main sponsor/use-case families explicit.

The public API should not just be "clean" in the abstract. It should serve the
actual kinds of people and tools most likely to build on top of `git-warp`.

For this cycle, three sponsor/use-case families matter most:

1. building apps
2. agentic CLI interactions
3. TTD / debugger-style tooling

These overlap, but they do not want exactly the same surface.

This note treats sponsor human and sponsor agent as equally important, while
adding TTD/tooling as a third sponsor family whose needs must stay honest in
the public API.

## Why This Matters

Historically, app-like consumers learned the wrong habit:

- materialize
- enumerate
- cache a second graph
- rebuild traversal and query logic above the substrate

That happened because the public surface did not clearly tell each consumer
which layer they were supposed to live in.

If we design only for one sponsor family, the API will drift:

- app builders will get too much plumbing
- agents will infer the wrong path
- TTD will lose honest access to core replay facts

## Sponsor 1: Application Builder

### Who This Is

A human developer building a normal product on top of `git-warp`.

Examples:

- collaborative offline-first tools
- multi-writer edge/device software
- Git-native decentralized applications
- domain products with graph-shaped data and intermittent connectivity

### What They Want

- a small set of primary nouns
- a stable way to read history-aware state
- filtered product reads
- speculative lanes when app behavior needs them
- braid when product behavior needs co-present lanes
- deterministic sync without central coordination

### What They Do Not Want

- replay mechanics as the default read story
- provenance plumbing in the happy path
- whole-state inspection as the normal app model
- debugger concepts leaking into the first-use surface

### Primary APIs For This Sponsor

- runtime/system open
- patch/write
- sync
- `Worldline`
- `Lens`
- `Observer`
- speculative lanes / strands
- braid where relevant to product behavior
- query / traverse on pinned read handles

## Sponsor 2: Agentic CLI Integrator

### Who This Is

A coding agent or advanced operator using `git-warp` in scripts, CLIs, or MCP
flows without wanting to rebuild graph semantics by hand.

Examples:

- an agent adding and resolving tasks over a shared graph
- an operator asking bounded graph questions from a CLI
- an MCP integration exposing git-warp-backed state to other tools

### What They Want

- a discoverable "right path" from type surface and examples
- APIs that answer questions directly from pinned handles
- explicit cost signaling
- thin syntax for common read/write patterns
- the ability to drop into core mechanics when a task really needs them

### What They Do Not Want

- having to infer doctrine from architecture papers
- flat root surfaces that make the wrong thing feel normal
- accidental preload/corpus-building traps

### Primary APIs For This Sponsor

- everything in the app-builder stratum
- plus explicit inspection or substrate entry points when the task is clearly
  migration/debug/admin shaped

This sponsor is especially sensitive to API optics: agents often follow what
the signatures and examples appear to reward.

## Sponsor 3: TTD / Debugger Tooling

### Who This Is

A debugger or developer tool that needs honest access to substrate truth.

Examples:

- `warp-ttd`
- provenance explorers
- conflict analysis tooling
- replay/debug shells
- multi-lane playback or scene coordination tools

### What They Want

- explicit coordinate replay
- immutable snapshots
- receipts / provenance
- comparisons and transfer facts
- fork/speculation hooks
- enough structure to coordinate multiple lanes into one playback story
- a way to step many worldlines or strands together without inventing fake
  global time

### What They Do Not Want

- product-facing docs that pretend these APIs do not exist
- app convenience layers that hide core facts
- implicit global time models that erase lane-local truth

### Important TTD Constraint

`warp-ttd` already treats `PlaybackHead` as a substrate-facing coordination
primitive over many lanes.

That means `git-warp` must remain capable of exposing the raw ingredients for:

- lane catalog
- lane-local observation
- immutable coordinate snapshots
- speculative lane control
- comparison/provenance facts
- composite frame seek/step over multiple lanes

### Primary APIs For This Sponsor

- coordinate replay and immutable materialization
- provenance / receipt / BTR inspection
- coordinate and lane comparison
- `PlaybackHead`-style multi-lane coordination
- lane catalog and writable-authority inspection
- speculation/fork hooks where capability-gated

TTD is therefore a strong argument for keeping the core APIs public, even while
moving app builders away from them by default.

## Likely `git-warp` Use Cases

### Strong-fit use cases

- offline-first multi-writer collaborative graph apps
- decentralized apps that already trust Git distribution
- edge / IoT systems with intermittent sync
- graph-shaped work-management or provenance-heavy systems
- agentic tools operating over shared graph state without a central server
- developer/debugger tooling that needs honest replay and provenance over the
  same substrate

### Medium-fit use cases

- internal developer tooling over graph-shaped Git-backed facts
- governance or review systems that need speculative lanes and comparisons
- long-lived notebook/knowledge/task systems with multiple writers

### Poor-fit use cases

- centralized low-latency OLTP apps
- real-time high-throughput deterministic simulation
- analytics/warehouse workloads
- use cases that need one globally serial transaction boundary

This matters because the public API should optimize for the strong-fit cases,
not for every possible graph-shaped thing.

## Hexagonal Consequence

The sponsor split implies a hexagonal boundary:

- app-facing adapters should mostly consume the product stratum
- agentic CLIs should default to the product stratum and enter core explicitly
  when needed
- TTD and debugger adapters should consume the core stratum through honest
  public ports

That is the cleanest way to keep Git-specific implementation details below the
public doctrine while still keeping replay/provenance truth accessible.

## Cross-host Consequence

Because Echo and `git-warp` are intended to converge on shared contracts
through Wesley-generated types later, the public nouns we foreground here
should be good candidates for cross-host use:

- `Worldline`
- `Lens`
- `Observer`
- speculative lane / `Strand`
- braid
- `PlaybackHead` for multi-lane coordination

Git-specific substrate details should remain lower-level implementation
concerns, not the main conceptual surface we expect other hosts to copy.

## IBM Hills

### Hill 1 — App Builder

As an application developer, I can build a real app using `Worldline`, `Lens`,
`Observer`, and speculative lanes without needing to understand replay
internals first.

### Hill 2 — Agentic CLI

As a coding agent or CLI integrator, I can infer the right question-shaped API
path directly from signatures and examples, and I do not default to materialize
plus array-walking.

### Hill 3 — TTD

As a debugger/tooling author, I can access replay/provenance/comparison facts
honestly without those APIs pretending to be ordinary app-read helpers.

## Playback Questions

- If a new app developer opens the repo, do they discover the WARP value story
  before the plumbing story?
- If an agent scans the public type surface, does it infer `Worldline` /
  `Lens` / `Observer` before `materialize()` / `getNodes()`?
- If TTD needs coordinate replay and receipt inspection, are those APIs still
  available without going through undocumented internals?
- Does the API structure reflect the split between product value and substrate
  mechanics, or does it still rely mostly on prose?

## Consequence For API Design

These sponsor families point toward one strong conclusion:

`git-warp` should expose both a product-facing stratum and a core-facing
stratum.

App builders and agentic CLIs should spend most of their time in the
product-facing stratum.

TTD and advanced tooling must still have honest access to the core-facing
stratum.

The structural decision is now:

- `WarpApp` as the primary product-facing surface
- `WarpCore` as the tooling/plumbing-facing surface
- one underlying runtime implementation beneath both

The remaining naming problem is also real:

- whether `WorkingSet` should become `Strand`
- whether `PlaybackHead` is mature enough to become a public noun in v15
- whether `WarpRuntime` should remain the primary root noun if a product/core
  split becomes structural

That is the next decision OG-010 needs to settle.
