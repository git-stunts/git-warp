# OG-003 — Deepen Public Snapshot Immutability

Status: READY

## Problem

Public materialize APIs now return detached state, but nested `Map` structures
are still writable by callers in their local copy.

## Why This Matters

The current slice fixed aliasing, not full immutability. Snapshot hashing and
read-only semantics would be stronger if callers could not mutate the public
structure at all.

## Promotion Trigger

Promote this item when we are ready to choose between frozen wrappers,
persistent/read-only collections, or another explicit immutable snapshot
representation.
