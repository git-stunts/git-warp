---
id: PROTO_bounded-support-rules-for-query-surfaces
blocked_by:
  - HYGIENE_warp-doctrine-runtime-alignment
blocks:
  - PROTO_causal-indexes-for-sliced-queries
  - PROTO_support-scoped-fragment-materialization
  - PROTO_tick-range-graph-diff-api
---

# Bounded support rules for query surfaces

**Effort:** M

## Idea

Define **bounded support rules** for public read APIs so the runtime
knows the smallest causally sufficient slice it must materialize for a
given question.

Instead of defaulting to "materialize the whole graph," each API would
declare its support law explicitly.

## Why this matters

Good APIs do not just expose friendly nouns. They also state what
support they require.

Examples:

- entity read:
  backward causal cone for that entity
- neighborhood read:
  bounded neighborhood support from the requested roots
- diff read:
  support for the interval or support for the affected patches
- observer read:
  support required by the declared observer scope

Without a bounded support rule, the runtime cannot tell whether a
partial fragment is enough, and it tends to fall back to whole-graph
materialization.

## What this is not

Bounded support rules are not indexes.

- an index reduces discovery cost
- a support rule reduces the scope of the question itself

The best query surfaces often need both.

## Why this could improve query performance

Today, APIs like `query().match("sym:*")` can hide a full scan because
the question is phrased as open-ended discovery over the whole graph.

If APIs were re-expressed with bounded support rules, many reads could
become:

- sliceable
- cacheable as support fragments
- replay-bounded instead of graph-size-bounded

## Examples of bounded support rules

- "all neighbors of `X` within depth `d`"
- "graph diff between `t0` and `t1`"
- "state of entity `X` at ceiling `t`"
- "all changes affecting scope `S` in interval `[t0, t1]`"

## Constraint

Not every query can honestly have a bounded support rule.

Questions like:

- arbitrary pattern search over all ids
- graph-wide aggregate
- whole-graph topo sort

remain global unless the contract changes or the system provides a
supporting index.

## Relationship to support-scoped fragments

Support-scoped fragment materialization needs a support rule first.

The fragment cache is only honest if the runtime can say:

- what support this fragment satisfies
- whether that support is enough for the next read

So bounded support rules are the contract layer that makes fragment
materialization possible.

## Why this is now a real backlog item

Cycle 0035 ("Observer geometry architecture ladder") promotes this out of
`cool-ideas/` and into `v19.0.0/` because the repo now treats support rules as
part of the real target runtime, not just a speculative aside.
