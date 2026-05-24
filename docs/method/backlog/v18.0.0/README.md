# v18.0.0 — Continuum-Compatible Graph Model Convergence

The hill: make `git-warp`'s graph model compatible with the concrete
shape Echo has already exercised while keeping both engines as equal
Continuum participants. They do not need to share the same public API,
admission model, or runtime shell.

Doctrine note: `PROTO_echo-shaped-*` task identities are historical
backlog shorthand for graph-model alignment pressure from Echo. They do
not mean Echo owns `git-warp`, and they do not make Continuum a runtime
hierarchy.

This release cuts the graph layer toward the shared two-plane model:

- skeleton-only node records
- skeleton-only edge records with stable edge identity
- explicit node and edge attachment slots
- typed attachment payloads instead of property folklore
- a graph-op algebra aligned with the substrate nouns
- a one-time migration that rewrites causal history into the new graph
  model and proves replay equivalence from genesis

## In scope

- node and edge record identity cuts
- attachment-plane substrate introduction
- content migration out of `_content` property conventions
- property-bag reads reduced to projection helpers
- graph-model migration tooling
- replay-from-genesis verification

## Explicitly out of scope

- full worldline or scheduler parity with Echo
- observer-plan and reading-envelope parity
- witnessed suffix admission shell parity
- live holographic strand semantics
- replacing the `git-warp` causal envelope unless the migration proof
  forces it

Those doctrine and protocol surfaces live in
[`../v19.0.0/README.md`](../v19.0.0/README.md).

## Critical path

```text
LAYER 0 (shape cut):
  [x] PROTO_echo-shaped-node-records
  [x] PROTO_echo-shaped-edge-records
  [x] PROTO_attachment-plane-substrate

LAYER 1 (behavioral convergence):
  [x] PROTO_graph-op-algebra-convergence
  [~] PROTO_content-attachment-plane-cutover
  [x] PROTO_legacy-props-as-projection

LAYER 2 (migration and proof):
  [~] INFRA_graph-model-migration-tool
  [~] TRUST_genesis-replay-equivalence
```

## Practical rule

`v18.0.0` is graph-model convergence, not "make git-warp become Echo."
Keep the `git-warp` causal envelope if it can faithfully carry the shared
graph model. Change the envelope only if replay honesty requires it.

## Status key

- `[ ]` not started
- `[~]` in progress
- `[x]` done
- `[!]` blocked

## Current Evidence

After v18 slice 49, the migration path is intentionally still
non-destructive but now has persisted-history evidence:

- dry-run request JSON can be decoded at the infrastructure boundary;
- the dry-run CLI can emit deterministic manifest output and refuses
  apply/write verbs;
- genesis equivalence has runtime-backed proof, mismatch, and divergence
  report nouns;
- compact fixtures cover node, edge, content, removal, multi-writer, and
  divergent-property cases;
- v17 golden graph-history fixtures now precede write-capable migration work,
  because compact fixtures do not prove the persisted Git object/ref layout;
- the first v17 golden fixture restores real `refs/warp/*` writer refs from a
  Git bundle and validates manifest heads, patch counts, and visible fact
  families;
- restored source inventory collection now reads real writer refs and patch
  commit trailers into migration-domain source inventory;
- operation lowering now creates write-ready migration operation facts from
  successful dry-run plans without writing history;
- scratch writing now creates deterministic operation commits under explicit
  `refs/warp-migration-scratch/*` refs and refuses live graph refs;
- scratch equivalence now gates promotion on proof success, first-divergence
  reporting, and required patch-boundary evidence;
- finalization safety now requires explicit confirmation, archive ref
  selection, scratch output evidence, a passed equivalence gate, and a matching
  live-ref expected head before any live lineage promotion can be implemented;
- archive-preserving finalization now creates archive refs and advances live
  refs only through expected-head `git update-ref` calls;
- command wiring now runs planning, lowering, scratch writing, equivalence,
  and optional finalization in order while keeping finalization off by default;
- finalization now also requires runtime conformance evidence tied to the
  exact scratch ref and head, making the remaining real-runtime replay provider
  an explicit release blocker instead of an implicit assumption;
- raw content/property compatibility boundaries are now enumerated by an
  executable closeout audit so new raw boundaries require deliberate review.
