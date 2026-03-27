# RFC: Public Snapshot Immutability Hardening

**Status:** IMPLEMENTED
**Date:** 2026-03-27
**Legend:** Observer Geometry
**Backlog:** `OG-003`
**Scope:** Make detached public snapshots transitively read-only without
retargeting live runtime state

---

## Problem

The detached read-side slices fixed cache aliasing, but they did not finish the
immutability contract.

Today:

- `materialize()` returns a detached clone
- `materializeCoordinate()` returns a detached clone
- `materializeWorkingSet()` returns a detached clone
- `getStateSnapshot()` returns a detached clone

But those clones still expose mutable nested containers and payload objects.

Specifically:

- `Map#set/delete/clear` still works on public snapshot maps
- `Set#add/delete/clear` still works on OR-set internals
- `prop` register objects still alias nested payload objects unless they are
  explicitly cloned/frozen

That means the current public snapshot is detached, but not honestly immutable.

---

## Goal

Strengthen the public snapshot contract so that the runtime can say:

\[
\texttt{materialize(...)} \to \texttt{detached, transitively read-only snapshot}
\]

without requiring a new public snapshot type in the same slice.

This is still a `WarpStateV5`-shaped value structurally, but it must behave as
an immutable snapshot for normal callers.

---

## Constraints

Any solution must preserve these conditions:

1. Public snapshots must not alias mutable runtime cache state.
2. Public snapshots must reject ordinary mutator calls on nested `Map` / `Set`
   structures.
3. Existing read consumers such as `createStateReaderV5(...)` must continue to
   work on returned snapshots.
4. Internal replay state must remain plain mutable data structures.
5. This slice must not require the full public `WarpState` noun reification.

---

## Chosen Direction

Use a two-part hardening pass for public snapshot returns:

1. clone the mutable replay state into independent containers
2. recursively convert public-facing containers into read-only views

### Container strategy

- `Map` values become proxy-backed read-only maps
- `Set` values become proxy-backed read-only sets
- plain objects and arrays are recursively frozen

The proxy layer must bind non-mutating methods back to the real target so that
normal reads still work:

- `get`
- `has`
- `entries`
- `keys`
- `values`
- iteration via `Symbol.iterator`

And the proxy must replace mutators with throwing functions:

- `set`
- `add`
- `delete`
- `clear`

This approach is preferred over `Object.freeze(new Map(...))` because plain
freezing does not stop `Map`/`Set` mutation.

It is preferred over a custom serialized snapshot representation because this
slice is meant to harden the current API, not introduce a new public state
format.

---

## Scope Of Hardening

This slice should harden every public API that returns materialized state:

- `WarpRuntime.materialize(...)`
- `WarpRuntime.materializeCoordinate(...)`
- `WarpRuntime.materializeWorkingSet(...)`
- `WarpRuntime.getStateSnapshot()`
- `Worldline.materialize()`

It should also ensure receipt-enabled materialization returns frozen receipt
arrays alongside immutable state.

---

## Invariants

After this slice lands:

1. `snapshot.prop.set(...)` throws.
2. `snapshot.nodeAlive.entries.set(...)` throws.
3. `snapshot.nodeAlive.tombstones.add(...)` throws.
4. Mutating a nested property payload object from the returned snapshot does not
   affect live runtime state.
5. `createStateReaderV5(snapshot)` still works.
6. Detached immutability applies equally to live, coordinate, and working-set
   materialization.

---

## Non-Goals

This slice does not:

- rename `WarpStateV5` to a new public `WarpState` type
- guarantee adversarial-proof immutability against deliberate prototype abuse
- redesign the internal reducer state representation
- change observer query surfaces that do not expose raw state directly

---

## Red Spec

The first executable spec tranche should prove:

1. public `materialize()` snapshots reject `Map` mutation
2. public `materialize()` snapshots reject OR-set `Set` mutation
3. nested property payload mutation does not leak back into live runtime state
4. `worldline.materialize()` returns the same hardened snapshot semantics
5. `getStateSnapshot()` returns the same hardened snapshot semantics

---

## Implementation Status

This landed on 2026-03-27.

Implemented shape:

- public snapshot returns now flow through one shared immutable snapshot helper
- `Map` / `Set` mutation through ordinary mutators throws
- nested plain object payloads are cloned and frozen
- receipt arrays are returned as frozen immutable arrays

The public noun is still `WarpStateV5`, so the stronger `WarpState` naming work
remains separate from this slice.

The implementation is intentionally aimed at honest caller-facing immutability,
not adversarial-proof hardening against deliberate prototype abuse.
