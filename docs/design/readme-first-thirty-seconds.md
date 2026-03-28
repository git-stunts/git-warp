# README first 30 seconds

Status: IMPLEMENTED

Legend: Observer Geometry

Cycle: OG-010

## Problem

The README had improved, but a first-time builder still had to read too long before the repo's practical value clicked.

The opening still made it too easy to walk away with one of these impressions:

- "this is an academic project"
- "this might take over my repo"
- "I probably need to understand WARP theory before I can try it"

That is the wrong front-door experience for `git-warp`.

## Goal

Make the first screen answer four questions quickly:

1. what is `git-warp` in plain language?
2. does it still let me use my repo like a normal repo?
3. how do I install it and try it right now?
4. what do terms like `tick`, `frontier`, and `braid` mean at a practical level?

## Decisions

### 1. Lead with utility before theory

Add a short `TL;DR for humans` section at the top of the README.

That section should say plainly that:

- `git-warp` is a distributed graph database
- it lives inside a Git repo without taking the repo over
- sync is deterministic and conflict-free for graph data

### 2. Put the quick start before deeper explanation

Move the first runnable path to the top:

1. install
2. open
3. patch
4. read back
5. query
6. traverse

The theory and architecture sections still matter, but they should not block the first try.

### 3. Use softer substrate framing

Prefer language like:

- "lives invisibly inside your Git repository"

and avoid language like:

- "turns your Git repo into ..."

The latter sounds invasive and implies that the repo stops being a normal repo.

### 4. Add a conceptual glossary

The README should bridge the gap between API docs and the papers by defining a few concepts in plain language:

- patch
- tick
- frontier
- Lamport clock
- worldline
- observer
- strand
- braid

### 5. Keep deeper theory below the front door

The README can still link to:

- AIΩN
- Echo
- architecture docs
- TTD docs

But those should sit below the first-use path rather than replacing it.

## Tests as spec

The executable contract for this slice should prove that:

1. the README contains `TL;DR for humans`
2. the quick start appears before deeper explanatory sections
3. the quick start includes install, open, patch, read, query, and traverse
4. the README still explains the WARP-vs-Git distinction and CRDT convergence
5. the README contains a conceptual glossary with `Tick`, `Frontier`, and `Braid`
