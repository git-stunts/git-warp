# Same-Writer Concurrent Patch Race Witness

**Effort:** M

## Problem

git-warp does not currently have a regression witness that proves
same-writer patch commits from isolated graph handles or subprocesses
cannot both report success while one mutation disappears from visible
graph truth.

That gap leaves a dangerous blind spot around the writer-tip race. The
bug only becomes obvious later, when a higher-level application checks
materialized state and finds that a "successful" write is no longer
reachable from the canonical writer chain.

## Notes

- Build the witness with two isolated handles or child processes using
  the same `graphName` and `writerId`.
- Acceptable outcomes:
  - one commit succeeds and the other fails with an explicit conflict
  - one commit retries/rebases and both mutations become visible in
    causal order
- Unacceptable outcome:
  - both APIs report success but only one mutation is reachable from
    the visible writer tip
- The playback should inspect final frontier plus visible entity state,
  not just thrown errors.
