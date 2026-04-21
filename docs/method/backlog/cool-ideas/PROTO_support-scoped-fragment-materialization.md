# Support-scoped fragment materialization

**Effort:** L

## Idea

Stop treating full-graph materialization as the default runtime mode.
Instead, make slice materialization the primary model:

- APIs declare the support they need
- runtime materializes only the causally sufficient slice
- runtime caches support-scoped fragments at coordinates
- later reads reuse exact or predecessor fragments and fill the missing support

## Why this is different from "just a cache"

A fragment is not just "some state at a frontier." It must be keyed by:

- a support declaration / scope
- a coordinate (`frontier + ceiling`)

Otherwise the runtime cannot know whether a cached fragment is
causally sufficient for the current question.

## What a fragment would need to remember

- the scope/support contract it satisfies
- the coordinate it is complete through
- the fragment state itself
- the support closure or equivalent proof of completeness
- provenance posture (full vs degraded)
- optional local adjacency / property indexes needed by that slice

## Why this could matter

Today the runtime assumes one `_cachedState` for the whole graph.
That makes local questions accidentally pay global materialization
costs.

If fragment materialization became primary:

- entity reads could reuse entity support fragments
- neighborhood reads could reuse scoped traversal fragments
- diff APIs could reuse interval-support fragments
- full-graph materialization would become the explicit special case

## Important constraint

This does **not** solve discovery queries by itself.

Questions like:

- "all nodes matching this arbitrary pattern"
- graph-wide aggregates
- graph-wide traversal orderings

still need either:

- a global scan, or
- a supporting index / bounded support rule

## Likely migration path

Do not flip the repo from "full state" to "fragments only" in one cut.

Instead:

1. introduce support-scoped APIs as the preferred surface
2. add fragment caches under those APIs
3. keep full `_cachedState` as compatibility/runtime fallback
4. shrink the set of APIs that require full materialization
5. only then consider replacing the singular runtime state model
