# 0126 Docs Materialize Frontdoor Drift Retro

- Date: 2026-05-04
- Cycle: [0126-docs-materialize-frontdoor-drift](../../design/0126-docs-materialize-frontdoor-drift.md)
- Source task: `SPEC_docs-materialize-frontdoor-drift`

## What Happened

The public docs were still split-brained. Types and consumer tests said
`openWarpGraph()` had no public materialize bag, but README, Getting Started,
Guide, and API Reference still taught app developers to fold before reading.

The cycle added a focused docs contract witness, then rewrote the first-use path
around readings: `graph.query`, live worldlines, pinned coordinates, observers,
strands, checkpoint-backed reads, and provenance diagnostics.

## What Got Better

- README and Getting Started now show an app path that compiles against the v17
  public surface.
- `docs/READINGS_AND_OPTICS.md` gives runtime errors and future docs a stable
  target for read-basis guidance.
- The DAG open front moved forward: runtime error guidance is now unblocked.

## What Still Smells

- Runtime source still has stale "Call materialize" guidance. That is the next
  DAG node, not part of this docs-only slice.
- API Reference still contains necessary substrate materialization vocabulary,
  which means future docs changes need to distinguish app-path residue from
  explicit tooling/substrate language.
- The new contract test is a source-text docs guard. It is justified here
  because the failure is documentation drift, but it should not become a model
  for behavior tests.

## Next

Pull `SPEC_runtime-error-reading-basis-guidance` and replace stale runtime error
messages with guidance that links to `docs/READINGS_AND_OPTICS.md`.
