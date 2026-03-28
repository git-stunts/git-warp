# README First-Use Onboarding

Status: IMPLEMENTED

Legend: Observer Geometry

Cycle: OG-010

## Problem

The README currently mixes several different jobs:

- release-news feed
- conceptual introduction
- first-use quick start
- public API teaching order
- architecture map

That makes the front of the README heavier and noisier than it should be for a
new reader.

The current tone also still carries traces of an internal corrective posture:

- it reads as if the reader is already using `git-warp` incorrectly
- it teaches the right path partly by warning against the wrong one
- it introduces some mechanics without enough conceptual framing

The README should instead read like a first-use guide for both sponsor
perspectives:

- sponsor human: an app developer learning what a WARP graph is and how to use
  it productively
- sponsor agent: a coding agent inferring the intended public API and cost
  model from examples and surrounding prose

## Decisions

### 1. Remove inline release-news sections

The README should not carry a long `What's New in vX` feed.

Release history already belongs in `CHANGELOG.md`. The README should prioritize
first-use comprehension over patch-line chronology.

### 2. Add conceptual framing early

Before the README settles into API surface teaching, it should explain:

- what a WARP graph is
- how `WarpRuntime`, `Worldline`, `Observer`, `WarpState`, and speculative
  lanes relate to one another
- why someone would choose a WARP graph instead of a conventional mutable graph
  store

### 3. Add an early glossary

The README should define its main nouns explicitly so a first-time reader does
not need to infer them from examples alone.

### 4. Replace corrective section naming/tone

`Core Primitives` should be rewritten as a neutral instructional section such
as `Main Components` or equivalent.

The prose should teach the system as-designed, not talk as if the reader is
already making mistakes.

### 5. Explain observer labels plainly

Quick Start should not use a mysterious observer label like `publicApi`
unexplained, and it should not require a label when the simpler unlabeled call
shape is sufficient.

The README should say plainly that:

- observer labels are optional
- the first argument to `observer(...)` is a descriptive observer label when
  supplied
- it is retained on `observer.name`
- it is reused when the observer seeks
- callers can choose any stable descriptive string meaningful to their app or
  debugger

### 6. Explain the read model, not just preference order

The `Read Model` section should explain why `worldline()` plus `observer(...)`
is the normal application-facing read boundary:

- pinned reads stay explicit and repeatable
- observers express the read aperture directly
- whole-state enumeration/materialization can push higher layers toward corpus
  preload and app-local graph rebuilding

## Tests As Spec

The executable doc policy for this slice should prove at least:

1. the README no longer contains `## What's New`
2. the README includes early `Concepts` and `Glossary` sections
3. the README uses a neutral component-teaching section instead of
   `Core Primitives`
4. the Quick Start still demonstrates `worldline().observer(...).query()`
5. the Quick Start explains the observer label argument
6. the `Read Model` section explains why the recommended path exists, not only
   that it is preferred
