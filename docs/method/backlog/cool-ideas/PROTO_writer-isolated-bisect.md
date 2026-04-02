# Writer-isolated bisect mode

A `--isolated` flag on bisect that materializes only the target
writer's patches up to a given point, ignoring other writers
entirely. Useful for debugging single-writer regressions without
cross-writer interference. Trade-off: faster materialization but
may miss interaction bugs.

If pursued: add `materializeForWriter(writerId, ceiling)` to
WarpGraph, wire `--isolated` flag in bisect CLI.
