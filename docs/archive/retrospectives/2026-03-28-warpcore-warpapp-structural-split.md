# Retrospective — WarpApp / WarpCore Structural Split

Status: CLOSED

Legend: Observer Geometry

Cycle: OG-010

## Governing Design Inputs

- IBM Design Thinking — `git-warp` Public API And README (deleted)
- Public API stratification (deleted)
- Product API vs Core API boundary (deleted)
- IBM Design Thinking: sponsor use cases for `git-warp` (deleted)
- WarpApp And WarpCore structural split (deleted)
- OG-010 backlog item (deleted)

## What Landed

This slice made the product/core split structural:

1. the package default export is now `WarpApp`
2. `WarpCore` is now the explicit plumbing-facing root
3. `WarpApp` exposes a curated product-facing subset plus `app.core()` as the
   escape hatch
4. named `WarpRuntime` remains as a compatibility alias to `WarpCore`
5. the README and Guide now teach `WarpApp` first and describe `WarpCore` as
   the lower-level surface

Code/artifacts added or updated:

- [WarpApp.js](../../../src/domain/WarpApp.js)
- [WarpCore.js](../../../src/domain/WarpCore.js)
- [index.js](../../../index.js)
- [index.d.ts](../../../index.d.ts)
- [README.md](../../../README.md)
- [GUIDE.md](../../GUIDE.md)
- [type-surface.m8.json](../../../contracts/type-surface.m8.json)
- WarpApp.facade.test.js (deleted)
- index.exports.test.js (deleted)
- public-api-facade-split.test.js (deleted)

## Design Alignment Audit

### Intended invariant: The product/core split should be structural, not prose-only

Status: aligned

`WarpApp` and `WarpCore` are now real public runtime exports, not just doc
concepts.

### Intended invariant: App builders and agents should discover the safer path first

Status: aligned

The package default export is now `WarpApp`, and the curated surface omits
direct materialization, whole-state enumeration, and root-scoped query/traverse
methods.

### Intended invariant: Tooling and TTD must still access honest substrate mechanics

Status: aligned

`WarpCore` remains the full plumbing-facing surface, and named `WarpRuntime`
continues to resolve to that full surface during the transition.

### Intended invariant: One engine should serve both public strata

Status: aligned

The split is implemented as two façades over one underlying runtime rather than
as two divergent engines.

### Intended invariant: The slice should not prematurely settle every noun question

Status: aligned

The split resolves the root-noun problem, but intentionally leaves these open:

- `Strand` vs `Strand`
- whether `PlaybackHead` becomes a public v15 noun

## Drift

### Documentation depth

Status: partially aligned

The front-door docs now teach `WarpApp` / `WarpCore`, but deeper sections of
the long Guide still contain historical `WarpRuntime` language where the
compatibility alias makes that technically true but no longer ideal.

### Compatibility alias

Status: partially aligned

The slice keeps named `WarpRuntime` as a compatibility alias to `WarpCore`
instead of deleting it outright.

That is a deliberate compromise to reduce breakage while the public narrative is
still being cleaned up across docs and examples.

## Why The Drift Exists

- sequence control: the IBM cycle still has deeper doc and noun cleanup left
- safety: keeping `WarpRuntime` as an alias reduces unnecessary breakage while
  `v15` is still unreleased
- scope discipline: this slice focused on structural split, not every follow-on
  rename

## Resolution

Keep OG-010 active.

The next likely slices are:

1. finish the deeper README/Guide/API wording cleanup around `WarpApp` /
   `WarpCore`
2. decide whether `Strand` becomes `Strand` before release
3. decide whether `PlaybackHead` becomes a public core noun in `v15`
