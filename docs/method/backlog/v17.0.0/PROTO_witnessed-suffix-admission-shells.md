---
id: PROTO_witnessed-suffix-admission-shells
blocked_by: []
blocks: []
---

# Witnessed suffix admission shells

## Why

Sync still teaches the older story:

- send frontier
- compute missing writer ranges
- return patches
- apply patches locally

That is coherent, but it is older than the current WARP line. v17
should describe remote import as witnessed suffix admission after
normalization to a comparable basis.

## What it should look like

- export emits a witnessed suffix shell, not a naked patch list
- shell names graph/lane identity, comparable basis, transported site,
  patch or BTR references, and witness material
- import returns explicit admission outcomes: admitted, staged, plural,
  conflict, obstruction
- frontier negotiation may remain as optimization, not protocol truth

## Done looks like

- sync request/response types stop equating truth with
  `frontier + patches`
- one export path emits a typed suffix shell
- one import path normalizes before deciding
- tests prove order-independent shell equivalence for independent
  imports and explicit plural/conflict/obstruction for non-independent
  cases

## Starting points

- `src/domain/services/sync/SyncProtocol.ts`
- `src/domain/services/sync/syncRequestResponse.ts`
- `src/domain/services/controllers/SyncController.ts`
