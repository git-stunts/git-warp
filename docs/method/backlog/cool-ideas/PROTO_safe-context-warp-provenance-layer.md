---
id: PROTO_safe-context-warp-provenance-layer
blocked_by: []
blocks: []
feature: docs-dx
---

# WARP provenance layer for safe-context

Tree-sitter is the parser. WARP graphs are the memory of structural
truth over time.

## The insight

Line numbers are trash — they drift constantly. A provenance-aware
structure can track symbol lineage across edits:

- "this is the same symbol, just transformed"
- "what changed since I last observed this file?"
- "read only the delta, in the smallest meaningful unit"

## What WARP models here

- File revision worldlines
- Symbol identity across revisions (stable even when lines drift)
- Structural rewrite events (method moved, param list changed,
  export surface widened — not line diffs)
- Agent observations of symbols
- Tool outputs as witnesses

## Concrete features this unlocks

- `since_last_read` — symbols changed since last observation
- `symbol_diff` — structural delta between worldlines
- `hot_regions` — symbols that churn most under edit-test loops
- `structural_checkpoint` — working state as touched symbol lineage
- Observer-relative views — human sees public API changes, agent
  sees exact changed symbols + dependencies

## The ramp

1. MVP (Phase 1): tree-sitter, no WARP. Ship safe-context.
2. Provenance model: file version, symbol identities, ranges,
   hashes, parent container, export status, observation timestamps.
3. Full: worldlines, structural deltas, observer-relative views.

## Key distinction

Track symbol lineage and structural deltas, not raw AST tombstones.
Current parse tree is ephemeral. Structural entities matter.
Provenance of those entities matters. Replayable transformations
matter.
