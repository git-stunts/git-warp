# Bounded Reads

`git-warp` is built so a read touches only the causal history it needs, instead
of folding the whole graph into memory. This page explains the idea and the
shipped surfaces that honor it.

## The model

History is a partial order `(H, ≼)` under causal precedence — Git's parent edges
are its Hasse diagram. A read does not need all of `H`; it needs the **causal
cone** of what it asks about: the down-set (order ideal)

```text
D(v) = ↓{v} = { x ∈ H | x ≼ v }
```

Because the order is well-founded, `D(v)` is finite even when `H` is unbounded.
That finiteness is *why* a bounded read can exist at all. A **bounded support
rule** is the claim "this question's answer factors through `D(v)`, so the rest
of `H \ D(v)` is provably unnecessary."

See [`docs/GLOSSARY.md`](../GLOSSARY.md) for the canonical status of each noun
below (shipped / transition / target).

## Shipped bounded-read surfaces

| Surface | What it bounds | Where |
| --- | --- | --- |
| `worldline.live().query()…` | A live read basis; no graph-wide materialization | `src/domain/services/ProjectionHandle.ts` |
| Coordinate optics (`coordinate().optic()…`) | A read pinned to a captured coordinate; fails closed without a bounded basis | `src/domain/WarpWorldlineCoordinate.ts` |
| `graph.comparison.diff({ from, to })` | A delta over two live Lamport ceilings, not a wildcard scan | `src/domain/capabilities/ComparisonCapability.ts` |
| `graph.provenance.materializeSlice(nodeId)` | A single entity's backward causal cone, replayed alone | `src/domain/services/controllers/ProvenanceController.ts` |

`materializeSlice()` walks the provenance index from a node, follows each patch's
`reads` edges, loads only the cone's patches, and replays just those. It is real
causal-cone reconstruction — and it is currently classified as a **diagnostic**
read path (`src/domain/capabilities/ProvenanceCapability.ts`), not a first-use
application API.

## The footgun it avoids

`getStateSnapshot()`-style full materialization parses the entire operation log
into one in-memory graph. For large histories that can exceed resident memory
and spike GC. Bounded reads exist so the default mental model is "ask a scoped
question," not "materialize the universe, then filter." Full-result helpers and
graph-wide diagnostics remain available but are explicitly classified; see
[`docs/PUBLIC_API_COSTS.md`](../PUBLIC_API_COSTS.md).

## Still target

Support-scoped **fragment** materialization (cached partial materializations
keyed by support contract and coordinate) and a first-class **materialization
plan** remain target doctrine. `BoundedSupportRule`, `CausalIndexPlan`, and
`SupportFragmentPlan` already travel through query open requests and name the
support posture, but fragment-cache storage and plan-driven execution are not yet
wired. See the [Doctrine/runtime Alignment Ratchet](../DOCTRINE_RUNTIME_ALIGNMENT.md).

## See also

- [Optics](optics.md) — the bounded question abstraction.
- [Observers](observers.md) — bounding *what* a reader may see.
- [Readings & Optics](../READINGS_AND_OPTICS.md) — the app-facing read model.
- Example: [`examples/bounded-reads.ts`](../../examples/bounded-reads.ts).
