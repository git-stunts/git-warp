# Glossary

This is the canonical noun source of truth for `git-warp`.

Use this file to answer:

- what a term means
- whether the term is shipped runtime truth, an active transition, or a
  target-model noun
- how the current repo surface relates to the canonical meaning

If another document uses one of these nouns differently, this glossary wins.

## Status key

- **shipped**: current repo/runtime truth
- **transition**: the repo uses this noun, but the implementation shape is
  narrower or partially mismatched
- **target**: the noun is part of the intended architecture, but not yet a
  first-class shipped runtime concept

## Core coordinates

| Term | Canonical meaning | Current repo manifestation | Status |
|---|---|---|---|
| `Coordinate` | A comparable read point composed from a causal basis and a ceiling. The smallest honest identity for a materialization/read target. | Public worldline coordinates use `WarpWorldlineCoordinate`; lower controller paths still often carry `frontier + ceiling` directly. | transition |
| `Frontier` | The causal basis of a read or write: the antichain/encoding that says what history has been observed. | Encoded operationally as version vectors and writer tips. | transition |
| `Ceiling` | The upper replay boundary on a chosen coordinate or lane. | Public APIs already use `ceiling` as the read bound. | shipped |
| `Tick` | One atomic admitted history step on a lane/worldline. | Often approximated by Lamport-bearing patches and receipts. | transition |

## History and read nouns

| Term | Canonical meaning | Current repo manifestation | Status |
|---|---|---|---|
| `Worldline` | The causal history of a deterministic read basis; a lawful history object, not merely a handle. | Public entry uses `openWarpWorldline()` for admitted lane workflows; pinned reads now return `ProjectionHandle` instead of a class named `Worldline`. | transition |
| `ProjectionHandle` | A pinned read/projection handle over a selected worldline source. | Returned by `WarpWorldline.live()`, `WarpWorldline.seek(...)`, and `graph.query.worldline(...)`. | shipped |
| `Observer` | The realized reading surface for a question asked through an aperture. It executes a read contract and returns a view. | Current `Observer` is mostly the projection/filter half over materialized state. | transition |
| `Aperture` | The observer-relative read boundary: what distinctions remain visible and which basis the read is taken over. | Current `Aperture` is a small `{ match, expose, redact }` policy object. | transition |
| `Optic` | The semantic question being asked of the graph. It defines the shape of the read, not the execution plan. | No first-class optic noun exists in runtime today. | target |

## Support and execution nouns

| Term | Canonical meaning | Current repo manifestation | Status |
|---|---|---|---|
| `Bounded support rule` | The smallest causally sufficient support set required to answer an optic through an aperture honestly. | Missing as a first-class runtime noun; partially implied by provenance and slice materialization. | target |
| `Causal index` | A materialized, rebuildable acceleration structure that helps find the relevant support set without whole-graph discovery. | Bits of this exist in provenance and receipts, but not as a unified indexed runtime surface. | target |
| `Support fragment` | A cached partial materialization keyed by support contract and coordinate, reusable for later reads. | Today the runtime mostly assumes one full cached state; fragments are not yet primary. | target |
| `Materialization plan` | The runtime execution plan that decides whether to use receipts, indexes, fragments, replay, or full state to satisfy a read. | Not explicit today; buried in controller behavior. | target |

## Change and proof nouns

| Term | Canonical meaning | Current repo manifestation | Status |
|---|---|---|---|
| `Witness` | Minimal information sufficient to justify a local change/rewrite result. | No first-class witness type yet. | target |
| `TickReceipt` | The operational envelope recording what happened for one admitted step, including outcomes and enough data to audit the admission. | First-class runtime type today. Larger than a witness. | shipped |
| `GraphDiff` | A first-class change result answering “what changed between these coordinates?” | Not yet a public runtime noun; substrate pieces exist (`PatchDiff`, `StateDiff`, receipts). | target |

## Persistence nouns

| Term | Canonical meaning | Current repo manifestation | Status |
|---|---|---|---|
| `WarpStateSnapshot` | A persisted materialized graph state at a coordinate. | First-class runtime snapshot noun after cycle 0034; the immutable public view is `SnapshotWarpState`. | shipped |
| `WarpStateCache` | The owning system for persisted and in-memory snapshot reuse. | First-class runtime/cache noun after cycle 0034. | shipped |
| `Checkpoint` | A pinned snapshot protected from ordinary eviction and discoverable as a stable retained read point. | Unified logically with snapshots after cycle 0034; discoverability/policy still maturing. | transition |

## Working law

Use these terms together like this:

1. An app asks an **Observer** to answer an **Optic**.
2. The read is bounded by an **Aperture** at a **Coordinate**.
3. The runtime derives the **bounded support rule** for that optic through
   that aperture.
4. **Causal indexes** and cached **support fragments** help find and reuse
   the necessary support.
5. A **materialization plan** fills in any missing support.
6. The runtime returns the observer-relative reading, optionally with a
   **TickReceipt**, **Witness**, or **GraphDiff** when that is what the optic
   asked for.

## Immediate implications

- `query().match("sym:*")` is not a good long-term noun or execution shape for
  change detection; it is a discovery query that lacks bounded support.
- “materialize the whole graph, then filter” should become the fallback path,
  not the default mental model.
- Any future public API that introduces a new noun should be reconciled here
  before it is taught as repo truth.
