# OG-010 — IBM Design Thinking Pass Over Public APIs And README

Status: ACTIVE

## Problem

Multiple higher-layer apps have repeated the same misuse pattern on top of
`git-warp`:

- materialize too much graph history into app memory
- write app-local graph read logic
- write app-local traversal logic
- treat whole-graph enumeration as a normal product read path

This is no longer just an application mistake. It is evidence that the
`git-warp` public surface and docs do not teach the right read discipline
strongly enough.

## Why This Matters

The substrate now has much better semantics than it had before:

- pinned read handles
- detached immutable snapshots
- `Worldline`
- `ObserverView`
- working-set read boundaries

But the public API and README still need a product-design pass so the right path
is easier to discover than the wrong one.

This cycle must consider two sponsor perspectives equally:

- sponsor human: an application developer trying to build a real product on
  top of `git-warp`
- sponsor agent: a coding agent trying to use `git-warp` without rebuilding a
  second graph engine above it

If the public surface serves one and confuses the other, it is not good enough.

## Intended Questions For The Cycle

- Which APIs are inspection/debug APIs versus product hot-path APIs?
- How should the README teach read discipline, not just raw capability?
- What cost-signaling is missing from the current surface?
- What task-shaped read examples should exist for both humans and agents?
- What public read helpers would let higher layers ask questions instead of
  rebuilding graph logic locally?

## Promotion

Promoted to:

- [docs/design/public-api-design-thinking.md](../docs/design/public-api-design-thinking.md)

This item now tracks the active cycle kickoff for the IBM Design Thinking pass
over the `git-warp` public API and README.
