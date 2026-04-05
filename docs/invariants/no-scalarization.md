# No Scalarization

## What must remain true?

Observer comparison in the system is always multi-dimensional. No
single metric, score, or flag is used as the sole criterion for
correctness, convergence, or equivalence. State equality, provenance
integrity, conflict structure, and performance characteristics are
tracked independently.

## Why does it matter?

OG-1, Theorem 87 (No exact scalarization of observer dominance)
proves that when independent task axes exist, no single scalar can
exactly replace coordinatewise observer signatures. Any attempt to
collapse observer comparison into one number fabricates at least one
dominance claim that the underlying geometry does not support.

In git-warp, this means: "materialize succeeded" is not sufficient
evidence that the graph is correct. State equality (tick confluence)
does not imply provenance integrity (backward completeness), which
does not imply audit verifiability (tamper evidence), which does not
imply performance acceptability (index freshness). Each axis must be
checked independently.

## Paper grounding

- **OG-1, Theorem 87** (No exact scalarization): for observer
  signatures with independent task axes, no exact scalarization of
  signature dominance exists.
- **OG-1, Remark 88**: any scalar summary imposes a total ranking,
  whereas observer dominance is naturally partial.
- **OG-1, Remark 89** (Operational use): compare with the partial
  order first, keep Pareto-undominated candidates, then apply
  deployment-specific tie-breakers.
- **OG-1, Corollary 94** (Task sufficiency != historical
  faithfulness): perfect task performance is not evidence of
  historical faithfulness.

## How the codebase upholds it

- `git warp check` reports multiple independent health metrics:
  patch count, writer count, version vector state, tombstone
  count, index freshness. No single "health score."
- `verify-audit` checks tamper evidence independently of
  materialization correctness.
- The test suite has independent test files for: materialization
  correctness (JoinReducer tests), multi-writer convergence
  (noCoordination), provenance queries (patchesFor), index
  correctness (bitmap tests), CLI output (BATS tests).
- `TickReceipt` records 8 distinct operation types (NodeAdd,
  NodeRemove, EdgeAdd, EdgeRemove, NodePropSet, EdgePropSet,
  BlobValue, and the base PropSet), preserving the full conflict
  structure rather than collapsing to a binary "accepted/rejected."

## How do you check?

1. **CLI output audit**: `git warp check` must report at least 4
   independent metrics. No single pass/fail boolean:
   ```bash
   git warp check --json | jq 'keys'
   ```
   Must contain multiple top-level keys.

2. **Test independence**: The test suite must have separate test files
   for state correctness, provenance, audit, and indexing:
   ```bash
   ls test/unit/domain/services/ | grep -i "reducer\|provenance\|audit\|index\|bitmap"
   ```

3. **No collapsed health check**: Grep for any single boolean health
   gate that would collapse multiple dimensions:
   ```bash
   grep -rn "isHealthy\|healthScore\|overallStatus" src/ --include="*.js"
   ```
   If found, verify it is composed from independent checks, not a
   single opaque computation.
