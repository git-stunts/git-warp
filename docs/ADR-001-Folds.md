# ADR-001: Folds — Structural Zoom Portals for Recursive Attachments

- **Date:** 2026-02-20
- **Status:** Proposed (Deferred)
- **Owner:** @flyingrobots
- **Decision Type:** Architecture / Data Model / Query Semantics

## Context

git-warp currently models a WARP graph skeleton (nodes + edges) with a property system that provides:
- multi-writer convergence (CRDT semantics / LWW for props)
- time-travel via materialization ceilings
- observer scoping / visibility rules

We also want **attachments** per the AIΩN Foundations Paper I lore:
- `α(v)` attaches a WARP value to each vertex
- `β(e)` attaches a WARP value to each edge
- base case is `Atom(p)` (external payload IDs, bytestrings, etc.)
- recursive case allows attachments to be WARP graphs (fractal structure)

Today, git-mind (and related consumers) are blocked primarily on a minimal “content attachment” primitive:
- store a git blob OID (CAS key) on a node as a normal property (e.g. `_content`)
- read/write blobs using the existing BlobPort
- rely on existing merge/time-travel semantics with no CRDT changes

This ADR proposes an optional future mechanism called **Folds** to support **structural recursion** (fractal attachments) as a **view/projection** feature first — without conflating it with network causality.

### Terminology Clarification

We have two concepts that must not be overloaded:

- **Wormhole (Causal):** a causal/sync concept (frontiers, receipts, replication topology)
- **Fold (Structural):** a structural boundary / zoom portal for recursive attachments (pure view)

This ADR is strictly about **Folds**.

## Decision

### For now (Immediate): Keep It Silly Simple

We will ship v1 content attachment using an Atom/CAS technique:

- Reserve a system property key:
  - `CONTENT_PROPERTY_KEY = "_content"`
- Attach content by storing a blob OID (git-cas key / git blob hash) as the property value.
- Read content by resolving the stored OID via BlobPort.

This is `Atom(p)` where `p` is a Git object ID — faithful to the Paper I base case.

### Proposed (Deferred): Add **Folds** for Structural Recursion

If/when we pursue true recursive WARP attachments, we will implement **Fold boundaries** as a structural convention:

- A fold is represented by a deterministic “fold root” node ID in the same graph.
- A skeleton entity (node or edge) has an attachment subgraph rooted at that fold root.
- Traversal/render/query operate at configurable “zoom levels”:
  - collapsed (ignore fold interiors)
  - shallow (peek one fold deep)
  - recursive (expand folds up to max depth)

Folds are **not causal shortcuts**, do not change synchronization, and do not create new op types.

## Fold Design

### 1) Representation

Folds are encoded using existing nodes/edges/props only.

#### 1.1 Fold Root IDs (deterministic)

We define deterministic fold root IDs to avoid collisions:

- **Node fold root:** `fold:node:<nodeId>`
- **Edge fold root:** `fold:edge:<from>|<label>|<to>`

Rules:
- `<nodeId>`, `<from>`, `<label>`, `<to>` must be encoded using existing codec rules (KeyCodec-safe).
- Fold root IDs are considered system-reserved namespace. Consumers must not invent IDs under `fold:*`.

#### 1.2 Fold Portal Edge Label

We use a reserved edge label (structural portal), e.g.:

- `@fold` (recommended for readability)
- (optional future mapping to paper notation: `_α` for vertex attachments, `_β` for edge attachments)

For node attachments:
- `<nodeId> -[@fold]-> fold:node:<nodeId>`

For edge attachments:
- `fold:edge:<from>|<label>|<to>` is reachable via a deterministic lookup, not necessarily by a visible portal edge.
  (We may add a portal edge if visualization benefits.)

### 2) Zoom Semantics (view/projection only)

Fold traversal is controlled by a **FoldPolicy**:

```ts
type FoldMode = "collapsed" | "shallow" | "recursive";

type FoldPolicy = {
  mode: FoldMode;
  maxDepth?: number;          // default: 0 for collapsed, 1 for shallow, Infinity for recursive
  include?: (foldRootId: string) => boolean; // optional filter
};
```

Default behavior for existing APIs:
- collapsed (fold interiors are ignored unless explicitly requested)

Rationale:
- prevents accidental "graph explosion"
- preserves current mental model for consumers
- makes Fold an opt-in "zoom lens"

### 3) API Surface (Proposed)

Folds should be exposed as explicit view operations, not implicit traversal surprises.

#### 3.1 View API

```javascript
const view = graph.view({ fold: { mode: "shallow", maxDepth: 1 } });

await view.traverse(startNodeId);
await view.query(...);
await view.renderAscii(...);
```

`graph.view()` returns a wrapper that:
- shares the same underlying state
- applies FoldPolicy to traversal and query expansions
- never changes commit/sync behavior

#### 3.2 Attachment Graph Accessors

```javascript
// returns fold root id (even if fold is empty)
graph.getFoldRootForNode(nodeId) -> string

// returns a "scoped view" whose traversals are rooted inside the fold
graph.getFoldViewForNode(nodeId, foldPolicy?) -> GraphView
```

### 4) Invariants

Folds must uphold:
1. Determinism: same graph state + same FoldPolicy => same view results
2. Non-causality: Fold does not affect sync, receipts, frontiers, or writer ordering
3. Safety by default: existing calls do not suddenly traverse recursive interiors
4. Codec safety: fold ids are canonical and cannot collide with consumer ids
5. Separation of concerns: "wormholes" remain causal; "folds" remain structural

## Consequences

### Benefits
- Enables a faithful "recursive WARP" structure without new op types.
- Adds "zoom levels" to tame fractal graphs for humans and tooling.
- Creates a path from blob attachments to structured, mergeable attachment graphs.
- Avoids conflating structural recursion with causal sync (wormhole drift).

### Costs / Risks
- Introduces a long-lived convention (fold namespace + portal semantics).
- Requires traversal/render/query APIs to accept FoldPolicy (complexity tax).
- Needs careful boundary handling to prevent accidental mutation of fold internals.
- Indexing may need fold-aware modes (exclude folds by default).

## Alternatives Considered

1. **Pointer recursion only** (Echo style: node stores ref to another graph)
   - Pros: simple, decoupled, aligns with existing multi-graph workflows
   - Cons: attachments not mergeable structurally within the same causal universe; harder partial replication
2. **Nested op logs per node/edge**
   - Pros: "true recursion" in a formal sense
   - Cons: extremely complex reducer/interpreter; heavy migration risk
3. **Store nested graphs as CAS blobs**
   - Pros: cheap
   - Cons: not structural recursion; merges become coarse (LWW)

Folds (namespaced subgraphs) are the "sane structural recursion" option.

## Rollout Plan

**Phase 0 (Now):** Ship Atom/CAS attachment (v1)
- `_content` property storing OID
- helper methods for attach/read
- tests + type surface
- docs/spec for content attachment

**Phase 1 (Later):** Fold MVP as view-only
- define fold id codec + reserved portal edge label
- implement `graph.view({ fold })` traversal expansion
- update renderers to show fold markers (collapsed vs expanded)
- no changes to sync / receipts / writers / JoinReducer

**Phase 2 (Later):** Structural attachment graphs
- standardize attachment schema conventions within fold subgraphs
- (optional) edge folds
- (optional) "attachment-aware" indexing/query helpers

## Decision Summary

We will proceed immediately with the minimal Atom/CAS `_content` technique to unblock consumers.

Folds are approved as a future direction for structural recursion and zoomable fractal graphs, but are explicitly deferred until a concrete consumer need demands it.
