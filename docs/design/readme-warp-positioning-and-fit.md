# README WARP Positioning And Fit

Status: IMPLEMENTED

Legend: Observer Geometry

Cycle: OG-010

## Problem

The README now works better as first-use onboarding, but it still blurs several
important distinctions:

- it still makes WARP sound too Git-specific
- it does not answer the obvious sync fear early enough:
  - "if this uses Git, do I have to resolve merge conflicts by hand?"
- it does not explain clearly why Git is the storage/transport substrate
- it does not position `git-warp` relative to `Echo` or ordinary alternatives

That leaves a new reader without a clear answer to:

- what is WARP versus `git-warp`?
- why was Git chosen?
- what kinds of applications is `git-warp` good at?
- when should I use `Echo` or something else instead?

## Goal

Make the front of the README answer four questions before the reader reaches
the tutorial:

1. What is `git-warp`?
2. What is WARP, and how is it different from `git-warp`?
3. Why is Git involved?
4. What kinds of problems is `git-warp` a good fit for?

## Decisions

### 1. Distinguish WARP from Git early

The README should state plainly:

- WARP itself is not tied to Git
- `git-warp` implements WARP on top of Git
- readers who want the theory should be sent to `AIΩN`

### 2. Explain CRDT sync before the reader worries about Git merges

The README should say early that:

- multiple writers can change the same graph independently
- graph changes merge deterministically using CRDTs
- users do not manually resolve Git merge conflicts for graph data

### 3. Explain why Git was chosen

The README should describe Git as a strong substrate match because it already
provides:

- content addressing
- cryptographic integrity
- distributed replication
- battle-tested push/pull transport

while `git-warp` provides the graph and CRDT semantics above that substrate.

### 4. Add a fit matrix

The README should include a simple use-case table with:

- `git-warp`
- `Echo`
- `Other`
- remarks

The table should include:

- strong `git-warp` cases
- strong `Echo` cases
- cases where neither is the right tool

### 5. Keep the Quick Start focused

The README tutorial still only needs enough context to:

- open a graph
- write data
- read it back
- query
- traverse

Deeper theory stays linked, not expanded inline.

## Tests As Spec

The executable doc contract for this slice should prove:

1. the README distinguishes WARP from `git-warp`
2. the README explains conflict-free CRDT sync early
3. the README links to `AIΩN` and `Echo`
4. the README includes a use-case fit table
5. the README still reaches the Quick Start through progressive disclosure
