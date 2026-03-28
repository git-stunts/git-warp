# README Progressive Disclosure Intro

Status: IMPLEMENTED

Legend: Observer Geometry

Cycle: OG-010

Note: the original "explain before quick start" ordering in this note was later refined by [README first 30 seconds](./readme-first-thirty-seconds.md), which moves `TL;DR` and the runnable quick start earlier while keeping the deeper WARP framing and glossary in the README front matter.

## Problem

The README front matter is better than it was, but it still assumes too much:

- that the reader already knows what WARP is
- that the reader already knows what a causal graph is
- that terms like `Worldline`, `Observer`, and `WarpState` can appear after a
  dense opening paragraph without causing confusion

The result is that the README still reads more like:

- "here is the system, now catch up"

than:

- "here is what this repo is, why it exists, and how to use it for the first
  time"

## Goal

Make the opening README path work for a reader who:

- has just landed on the GitHub repo
- has never heard of WARP graphs
- may not know what a causal graph is
- only needs enough conceptual framing to:
  - open a graph
  - write a few nodes/edges
  - read them back
  - run a query
  - traverse the graph

That is enough for the README tutorial. Deeper internals can stay later in the
document or in secondary docs.

## Decisions

### 1. Start with plain-language framing

The first explanation should answer:

- what is this repo?
- what does it let me do?
- why would I use it instead of a normal graph database or a pile of JSON?

The opening should use plain language first and only then introduce the WARP
name and its more formal terminology.

### 2. Use progressive disclosure

Terms should be introduced before they are relied on.

The intended order is:

1. what `git-warp` is in plain language
2. why someone would want it
3. the minimum mental model / glossary
4. a quick-start tutorial
5. the read model
6. the deeper documentation map

### 3. Make the quick start tutorial-shaped

The quick start should explicitly walk through:

1. opening a graph
2. writing nodes/edges
3. reading a node back
4. querying for matching nodes
5. traversing relationships

That is the minimum path most first-time readers need.

### 4. Avoid premature internal detail

The README introduction should not rely on:

- provenance payloads
- holography
- wormholes
- settlement transfer planning
- advanced strand mechanics

Those are real and important, but they are not required to get through the
first-use path.

## Tests As Spec

The executable doc contract for this slice should prove:

1. the README contains a plain-language introduction section before Quick Start
2. the README contains a "why use it" section before deeper API teaching
3. the README contains an early mental-model or glossary section before Quick
   Start
4. the Quick Start explicitly demonstrates:
   - writing
   - reading back
   - querying
   - traversing
5. the README still teaches the worldline-first read boundary
