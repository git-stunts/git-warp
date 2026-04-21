# Causal indexes for sliced queries

**Effort:** L

## Idea

Add first-class support for **causal indexes**: materialized,
maintained structures that let the runtime answer change and
slice-oriented questions without replaying or scanning the full graph.

Examples:

- "what changed between `t0` and `t1`?"
- "what patches affect entity `X` up to ceiling `t`?"
- "what is the nearest cached support fragment for this query?"
- "which entities in namespace `sym:` were removed in this interval?"

## Why this matters

Today, full-state materialization is the default hammer. That makes
local questions accidentally pay global costs.

A causal index would let the runtime jump directly to relevant support
instead of discovering it by replaying or scanning everything.

## What a causal index could index

- entity → affecting patch SHAs
- patch/tick → touched entities
- interval/range → net structural/property delta summaries
- support fragment descriptor → compatible predecessor fragments
- namespace/prefix → causally changed members

## Why "index" is the right noun

This is not just a cache.

- a cache stores previously computed answers
- an index stores structure that helps the runtime *find* the relevant
  support set quickly

For these to be useful, they likely need to be materialized and kept
up to date as patches land, just like other indexes in the system.

## Relationship to fragment materialization

Support-scoped fragment materialization can reuse cached fragments once
the runtime knows they are relevant.

Causal indexes are what help answer:

- which fragment is relevant?
- which patches are relevant?
- what support closure is required?

Without causal indexes, sliced APIs still risk falling back to
expensive discovery work.

## Constraint

Do not let causal indexes become opaque correctness theater.
They must either:

- be derivable from durable repo truth, or
- be clearly marked as accelerators that can be rebuilt

## Possible first slice

Start with a bounded `tick-range -> changed-entities` index or an
`entity -> patch SHAs` index promotion of the existing provenance
surface, then see whether that is enough to support a real
`graph.diff({ from, to })` API efficiently.

## Why this is now a real backlog item

Cycle 0035 ("Observer geometry architecture ladder") promotes this out of
`cool-ideas/` and into `v19.0.0/` because slice-first reads need an actual
index family, not just the hope that replay and query scans will be good
enough.
