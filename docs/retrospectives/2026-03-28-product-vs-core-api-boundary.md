# Retrospective — Product vs Core API Boundary

Status: CLOSED

Legend: Observer Geometry

Cycle: OG-010

## Governing Design Inputs

- [OG-010 public API design thinking](../design/public-api-design-thinking.md)
- [Public API stratification](../design/public-api-stratification.md)
- [Product API vs Core API boundary](../design/product-vs-core-api-boundary.md)
- [IBM Design Thinking: sponsor use cases for `git-warp`](../design/git-warp-sponsor-use-cases.md)
- [OG-010 backlog item](../../BACKLOG/OG-010-public-api-design-thinking.md)

## What Landed

This slice did not change runtime code. It tightened the active IBM cycle by
making three things explicit:

1. `git-warp` has both a product-facing stratum and a core/tooling stratum.
2. The cycle now treats three sponsor families explicitly:
   - app builders
   - agentic CLI users
   - TTD/debugger tooling
3. The "step worldlines together" concept is now pinned as `PlaybackHead`, a
   core/tooling coordination primitive rather than an ordinary app-read noun.

## Design Alignment Audit

### Intended invariant: Product value should be foregrounded over plumbing

Status: aligned

The new notes classify `Worldline`, `Lens`, `Observer`, speculative lanes, and
braid as the primary product-facing WARP story, while keeping provenance,
materialization, receipts, BTRs, and playback coordination in the core/tooling
stratum.

### Intended invariant: Human and agent perspectives must both remain first-class

Status: aligned

The sponsor framing continues to treat app builders and agents as equal primary
perspectives, and now makes the TTD/tooling sponsor explicit without replacing
them.

### Intended invariant: TTD should stay substrate-honest

Status: aligned

The cycle now explicitly places `PlaybackHead`, coordinate replay, immutable
snapshots, provenance, and comparisons in the core/tooling stratum rather than
burying them under app-facing ergonomics.

### Intended invariant: Cross-host compatibility pressure should influence noun selection

Status: partially aligned

The new notes now call out future Echo/Wesley compatibility explicitly, but the
public noun set is still unresolved in two places:

- `Strand` vs `Strand`
- whether `PlaybackHead` becomes a shipped public noun in v15

## Drift

No implementation drift occurred in this slice because the work was design-only.

The remaining open design drift is intentional:

- the public docs and type surface still present `Strand`
- the codebase does not yet expose a real `PlaybackHead` API
- the public structure is still flatter than the design now recommends

## Why The Drift Exists

- deliberate sequencing: finish the IBM design pass before cutting more public
  API
- implementation cost: product/core stratification may require a meaningful
  method-placement change
- maturity: `PlaybackHead` is conceptually clear but not yet ready to promise
  as a shipped public primitive

## Resolution

Keep OG-010 active.

The next slices should answer:

1. whether product/core separation becomes structural in v15
2. whether `Strand` is renamed to `Strand` before release
3. whether `PlaybackHead` remains design-only for v15 or becomes a real public
   core noun
