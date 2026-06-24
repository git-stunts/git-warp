# 0126 Docs Materialize Frontdoor Drift

- Status: `hill met`
- Date: 2026-05-04
- Release lane: `v17.0.0`
- Source task: `SPEC_docs-materialize-frontdoor-drift`
- DAG source: [0124-v17-release-blocker-dag.md](0124-v17-release-blocker-dag.md)

## Hill

The public first-use docs teach the honest v17 read contract:
`openWarpGraph()` writes through `graph.patches` and reads through
`graph.query`, worldlines, observers, and readings/optics guidance. They
do not instruct application developers to call `graph.materialize` before
querying.

## User Stories

- As a new app developer, I can copy the README or Getting Started path
  and read through `graph.query` without discovering a removed public
  materialize capability.
- As a maintainer, I can run a focused docs contract test that fails if
  first-use docs drift back to `graph.materialize`.
- As a release reviewer, I can see a dedicated readings/optics guide
  that distinguishes public app reads from substrate/tooling replay.

## Requirements

- Add `docs/READINGS_AND_OPTICS.md`.
- Link the readings/optics guide from README, Getting Started, Guide,
  API Reference, and docs index.
- Purge public materialization-frontdoor examples from:
  - `README.md`;
  - `docs/GETTING_STARTED.md`;
  - `docs/GUIDE.md`;
  - public app-path sections of `docs/API_REFERENCE.md`.
- Keep explicit substrate/tooling materialization vocabulary where it is
  clearly CLI, provenance, strand, sync-option, or advanced internals.
- Do not add public compatibility shims.
- Do not edit runtime/query/storage production code.

## Acceptance Criteria

- Focused docs-contract RED goes green.
- `npm run lint:md` passes.
- `npm run lint:md:code` passes.
- `npm run typecheck` passes.
- `npm run lint` passes.
- `CHANGELOG.md` records the public-doc contract fix.
- The DAG status marks `SPEC_docs-materialize-frontdoor-drift`
  complete and regenerates the SVG.

## Test Plan

### RED

Add a docs-contract test for public read docs:

- README, Getting Started, and Guide must not contain `graph.materialize`.
- API Reference must not contain `graph.materialize.materialize`,
  "Call materialize()", or language that names `graph.materialize` as a
  normal read-side app capability.
- README, Getting Started, Guide, API Reference, and docs index must
  link to `READINGS_AND_OPTICS.md`.

Expected initial failure: the docs still teach the materialization
frontdoor and the readings/optics guide does not exist yet.

### Goldens

- README quick start: write with `graph.patches`, read with
  `graph.query.worldline()` / `worldline.getNodeProps(...)`.
- Getting Started current-state read: no explicit folding call.
- Guide mental model: capability namespaces do not include
  `graph.materialize`.
- API Reference app read boundary: `graph.query`, worldlines, and
  observers are the read path.
- `docs/READINGS_AND_OPTICS.md`: names live, pinned, observer, strand,
  checkpoint-backed, and provenance readings.

### Known Fails Outside This Cycle

- `npm run test:local` remains red on non-doc release blockers.
- Runtime error text in source remains a separate DAG node:
  `SPEC_runtime-error-reading-basis-guidance`.

### Stress / Jitter

This is a docs contract. Runtime stress does not apply. The jitter guard
is the docs-contract test: it fails when future docs churn reintroduces
the removed materialization frontdoor to first-use docs.

## Playback Questions

1. Can a new reader follow README/Getting Started without seeing
   `graph.materialize`?
2. Is the first public read noun `graph.query` / worldline / observer?
3. Is lower-level replay/materialization vocabulary either removed or
   clearly marked as substrate/tooling?
4. Did this cycle avoid production code changes?
5. Did the DAG status and SVG move the open-node frontier forward?

## Non-Goals

- Do not replace runtime error messages in source in this cycle.
- Do not remove `_materializeGraph()`.
- Do not change `WarpCore` or substrate APIs.
- Do not solve the post-v17 live-tail bounded query/checksum substrate.

## RED Evidence

Command:

```sh
npx vitest run test/unit/scripts/v17-public-doc-read-contract.test.ts
```

Initial result: failed as expected.

- README still contained `graph.materialize.materialize({})` in the
  quick start.
- Getting Started still told readers to fold patches before reading.
- Guide still named `graph.materialize` as a normal capability namespace
  and receipt path.
- API Reference still told users to "Call materialize()" and described
  `graph.materialize` as a read-side app capability.
- Public docs did not link a dedicated readings/optics guide.

## GREEN Implementation

- Added [Optics](../topics/optics.md), covering
  live, pinned, observer, strand, checkpoint-backed, and provenance
  readings.
- Rewrote README and Getting Started examples so writes use
  `graph.patches` and reads use `graph.query.worldline()`.
- Reframed Guide and API Reference public app paths around `graph.query`,
  worldlines, observers, provenance diagnostics, and checkpoint artifacts.
- Left lower-level materialization vocabulary only where it remains
  explicit substrate/tooling or sync-option language.
- Updated `CHANGELOG.md` and the 0124 DAG status/Graphviz artifacts.

## Validation

- `npx vitest run test/unit/scripts/v17-public-doc-read-contract.test.ts`:
  pass.
- `npx vitest run test/unit/scripts/v17-public-doc-read-contract.test.ts test/unit/scripts/read-api-doc-consistency.test.ts test/unit/scripts/public-api-getting-started-shape.test.ts test/unit/scripts/public-api-guide-shape.test.ts test/unit/scripts/public-api-readme-shape.test.ts test/unit/scripts/documentation-corpus-shape.test.ts test/unit/scripts/v17-materialization-contract-docs.test.ts`:
  pass, 7 files / 26 tests.
- `npm run lint:md`: pass.
- `npm run lint:md:code`: pass, 940 Markdown files checked.
- `npm run typecheck`: pass.
- `npm run typecheck:consumer`: pass.
- `npm run lint`: pass.
- `git diff --check`: pass.

`npm run test:local` was not rerun for this docs-only slice because the
branch still has known non-doc release blockers tracked in the DAG.

## Playback

- A new reader can follow README/Getting Started without seeing a public
  `graph.materialize` frontdoor.
- The first public read noun is `graph.query`, then worldline, observer,
  and optic.
- Lower-level materialization language remains possible only outside the
  first-use app path.
- No production code changed.

## Drift Check

This cycle intentionally added one docs-source contract test. That is a
limited docs-drift guard for public documentation content, not a pattern
for testing production behavior through source-text assertions.

## Retro

See [0126-docs-materialize-frontdoor-drift.md](../method/retros/0126-docs-materialize-frontdoor-drift.md).
