# 2026-03-28 — WarpRuntime Public Cut

## Governing Design Inputs

- [public-api-design-thinking.md](../design/public-api-design-thinking.md)
- [product-vs-core-api-boundary.md](../design/product-vs-core-api-boundary.md)
- [public-api-stratification.md](../design/public-api-stratification.md)
- [warpcore-warpapp-structural-split.md](../design/warpcore-warpapp-structural-split.md)
- [warpruntime-public-cut.md](../design/warpruntime-public-cut.md)

## What Landed

- `WarpRuntime` was removed from the package public exports
- `WarpCore` is now the only public plumbing-facing root
- `WarpApp` remains the default product-facing root
- the public type surface, README, Guide, and consumer/spec tests now teach
  `WarpApp` / `WarpCore` without a compatibility alias

## Design Alignment Audit

- `aligned` — `WarpApp` remains the default public root for app builders
- `aligned` — `WarpCore` remains the full plumbing/tooling surface
- `aligned` — `WarpRuntime` is no longer part of the public contract
- `aligned` — front-door docs stop teaching the removed noun

## Drift

No design drift in this slice. The cut was intentionally sharper than the
previous structural split note because the user explicitly chose a full major
version break instead of a compatibility transition.

## Resolution

Keep the internal `WarpRuntime.js` implementation file for now, but treat it as
an internal engine detail rather than a public API noun.
