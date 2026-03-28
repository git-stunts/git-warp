# OG-011 — Public API Catalog And Browser Documentation Playground

Status: QUEUED

## Why

`git-warp` now has a meaningful public API split, but the package still does
not have a dedicated public API catalog or web-based documentation surface.

Today the docs are effectively spread across:

- `README.md`
- `docs/GUIDE.md`
- `index.d.ts`
- source code and tests

That is workable for maintainers, but not ideal for:

- application builders evaluating whether git-warp fits their use case
- agentic consumers trying to infer the public contract quickly
- debugger / TTD / advanced substrate users looking for deeper API material
- browser users experimenting with WARP in a runnable environment

## Desired Outcome

Define and ship a public documentation surface that makes the full API legible
without forcing readers into the source tree.

## Candidate Scope

- generate or curate a full public API catalog from the exported type surface
- decide on a docs stack instead of leaving this implicit
  - options might include VitePress, a custom docs app, or another static site
    approach
- publish web-based documentation for:
  - `WarpApp`
  - `WarpCore`
  - `Worldline`
  - `Lens`
  - `Observer`
  - speculative lanes / braid / playback coordination primitives as they
    stabilize
- support examples that run in the browser where feasible
- explore an interactive playground where a user can create, patch, query, and
  traverse a small WARP graph directly in-browser

## Questions To Settle

- should the API catalog be generated from `index.d.ts`, source annotations, or
  a hand-curated manifest layer?
- is VitePress the right fit, or do interactive browser demos push us toward a
  custom docs app?
- how should product-facing docs and core/tooling docs be separated?
- what is the minimum viable browser playground that teaches real WARP concepts
  without becoming a second product?

## Non-Goals

- choosing and implementing the full docs stack in the same cycle as `v15`
- building a full TTD inside the docs site
- duplicating README/GUIDE prose without a clearer information architecture
