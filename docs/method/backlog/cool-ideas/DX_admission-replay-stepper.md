---
blocked_by: []
blocks: []
id: DX_admission-replay-stepper
---

# Admission replay stepper

A mode where you step through how the current state was built —
tick by tick, showing what was admitted and what was blocked at
each step. Like `git warp seek` but with admission witnesses visible.

Could be a CLI command (`git warp replay --step`) or a warp-ttd
feature. The key insight: if the admission kernel produces witnesses
at every tick, the entire history becomes a replayable admission
trace, not just a state trace.
