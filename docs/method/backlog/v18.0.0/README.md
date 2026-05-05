# v18.0.0 — Echo-Shaped Graph Substrate Convergence

The hill: make `git-warp` and Echo share the same graph substrate
shape without pretending they must immediately share the same public
API, admission model, or runtime shell.

This release cuts the graph layer to the Echo-shaped two-plane model:

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
  [ ] PROTO_echo-shaped-node-records
  [ ] PROTO_echo-shaped-edge-records
  [ ] PROTO_attachment-plane-substrate

LAYER 1 (behavioral convergence):
  [ ] PROTO_graph-op-algebra-convergence
  [ ] PROTO_content-attachment-plane-cutover
  [ ] PROTO_legacy-props-as-projection

LAYER 2 (migration and proof):
  [ ] INFRA_graph-model-migration-tool
  [ ] TRUST_genesis-replay-equivalence
```

## Practical rule

`v18.0.0` is graph-substrate convergence, not "make git-warp become
Echo." Keep the `git-warp` causal envelope if it can faithfully carry
the shared graph model. Change the envelope only if replay honesty
requires it.

## Status key

- `[ ]` not started
- `[~]` in progress
- `[x]` done
- `[!]` blocked
