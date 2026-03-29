# OG-017 — Break up the `index.d.ts` monolith

Status: QUEUED

Legend: Observer Geometry

## Problem

`index.d.ts` is 3,700+ lines and growing. Even with automated surface
checks (`check-dts-surface.js`, `ts-policy-check.js`), a single monolithic
declaration file is hard for a human to audit, review, or navigate.

The editor's report (2026-03-29) flagged this as a liability.

## Why this matters

- PR diffs that touch `index.d.ts` are noisy — every type change shows up
  in one giant file, making review harder.
- Contributors adding new public types must scroll through thousands of
  lines to find the right insertion point.
- IDE "go to definition" lands in a 3,700-line file instead of a focused
  module.
- The surface check scripts already parse the monolith — they could parse
  modular files instead.

## Desired outcome

Break `index.d.ts` into modular `.d.ts` files that mirror the `src/domain/`
structure, then use a build step (or barrel re-export) to produce the final
`index.d.ts` for publishing.

Likely shape:

- `types/core.d.ts` — WarpCoreBase, WarpCore, WarpApp
- `types/crdt.d.ts` — VersionVector, ORSet, LWW, Dot
- `types/traversal.d.ts` — GraphTraversal, LogicalTraversal, TraverseFacadeOptions
- `types/conflict.d.ts` — ConflictAnalysis, ConflictTrace, etc.
- `types/strand.d.ts` — StrandDescriptor, StrandCreateOptions, etc.
- `types/visible-state.d.ts` — VisibleState comparison/transfer types
- `types/ops.d.ts` — OpNodeAdd, OpPropSet, EventId, factory functions
- `types/ports.d.ts` — BlobStoragePort, GraphPersistencePort, etc.
- `index.d.ts` — generated barrel that re-exports everything

## Acceptance criteria

1. `index.d.ts` is generated from modular source files (or is a thin barrel).
2. `npm pack --dry-run` and `jsr publish --dry-run` still work.
3. Surface check scripts still validate the full export surface.
4. `tsc --noEmit` and consumer type tests still pass.
5. No public API surface changes — purely an internal reorganization.

## Non-goals

- No TypeScript migration — source stays JavaScript with JSDoc.
- No runtime changes.
