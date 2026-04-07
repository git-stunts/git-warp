# FULL-COVERAGE

## What must remain true?

Every source file in `src/` must have 100% line coverage from the
unit test suite.

## Why does it matter?

This is a database engine. Untested code is unverified code. 12,278
lines of critical-path code (strand services, controllers, runtime)
shipped with zero tests. The noCoordination suite proves CRDT
semantics, but it cannot prove that individual services handle their
edge cases — error paths, cancellation, boundary conditions,
configuration variants. A correctness bug in an untested service
can corrupt graph state silently.

100% line coverage is not 100% correctness. But 0% line coverage is
0% evidence. The invariant closes the evidence gap.

## How do you check?

```bash
npx vitest run test/unit/ --coverage --coverage.thresholds.lines=100
```

## Baseline

2026-04-05: 85.46% lines, 75.03% branches, 88.93% functions.

## Ratchet

Coverage may only increase. Each cycle that touches source files
must not reduce the coverage percentage. The CI gate enforces this
via `--coverage.thresholds.lines`.

Once 100% is reached, the threshold is locked and any PR that drops
below fails CI.
