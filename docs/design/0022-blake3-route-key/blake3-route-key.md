---
title: "Binary blake3(elementId) route-key derivation and routing helpers"
legend: "PROTO"
cycle: "0022-blake3-route-key"
source_backlog: "docs/method/backlog/v17.0.0/PROTO_blake3-route-key.md"
---

# Binary blake3(elementId) route-key derivation and routing helpers

Source backlog item: `docs/method/backlog/v17.0.0/PROTO_blake3-route-key.md`
Legend: PROTO

## Sponsors

- Human: Backlog operator
- Agent: Implementation agent

## Hill

TBD

## Playback Questions

### Human

- [ ] TBD

### Agent

- [ ] TBD

## Accessibility and Assistive Reading

- Linear truth / reduced-complexity posture: TBD
- Non-visual or alternate-reading expectations: TBD

## Localization and Directionality

- Locale / wording / formatting assumptions: TBD
- Logical direction / layout assumptions: TBD

## Agent Inspectability and Explainability

- What must be explicit and deterministic for agents: TBD
- What must be attributable, evidenced, or governed: TBD

## Non-goals

- [ ] TBD

## Backlog Context

## Problem

The Shadow-Trie ORSet needs a deterministic, uniformly distributed key
to route elements into trie paths. Raw element IDs (node IDs, edge keys)
are variable-length strings with non-uniform distribution.

## Fix

Create a `RouteKey` module in `warp-orset` that:

1. Takes a string element ID
2. Computes its blake3 hash (32 bytes)
3. Extracts a sequence of 4-bit nibbles for trie path navigation

Public API: `routeKey(element: string): Uint8Array` and
`nibbleAt(key: Uint8Array, depth: number): number`.

## Scope

**In:** Pure functions, no I/O. Unit tests with property-based
distribution checks. blake3 dependency wiring.

**Out:** No trie structure. No storage. Just the hash-to-nibble-path
derivation.
