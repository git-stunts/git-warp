# Causal Time Only

## What must remain true?

The domain's concept of "time" is exclusively causal: tick numbers,
Lamport clocks, version vectors, frontier positions, and commit
ancestry. The domain never asks "what time is it?" — it asks "what
has happened?"

Four concepts that people collapse into "time" must remain distinct:

| Concept | Belongs in | Example |
|---------|-----------|---------|
| **Causal time** | Domain (core semantic) | Tick number, frontier, version vector |
| **Wall-clock time** | Adapter boundary only | ISO timestamps on logs, audit records |
| **Monotonic duration** | Adapter/profiler only | `performance.now()` spans for ops telemetry |
| **Scheduler time** | Adapter/caller only | `setInterval` for polling |

Only causal time crosses the domain boundary. The other three are
infrastructure concerns that must not affect domain behavior,
persisted state, snapshots, or replay.

## Why does it matter?

If the domain reads wall time during materialization, two replays of
the same boundary encoding `(U_0, P)` at different wall times produce
different states. The holographic guarantee (Paper III, Theorem 4.1)
collapses.

If the domain reads a monotonic timer during patch construction, the
patch carries timing artifacts that vary between machines. Determinism
is lost.

If the domain schedules its own timers, the scheduler is no longer a
total function of state (Paper II, Definition 4.5) — it becomes a
function of runtime cadence.

Causal time comes from the log. Everything else is weather.

## Paper grounding

- **Paper II, Definition 4.5** (Scheduler policy): total function
  of state, not ambient context.
- **Paper III, Theorem 4.1** (Computational holography): boundary
  encoding uniquely determines the interior — only if no ambient
  inputs leak in.
- **Paper III, Remark 3.4** (Anti-tautology): patches must not
  depend on ambient state.
- **Paper IV, Section 3** (Chronos): the linear time of a fixed
  worldline is a functor from a finite linear order into the
  history category. It is defined by the worldline itself, not by
  the wall clock of the machine running it.

## How do you check?

1. **Invariant composition**: This invariant is upheld by three
   sub-invariants working together:
   - `no-ambient-time.md` — bans Date.now, performance.now
   - `no-ambient-entropy.md` — bans Math.random, crypto.random
   - `no-ambient-scheduling.md` — bans setTimeout, setInterval

2. **Semantic check**: For any domain function, ask: "If I replay
   this function with the same inputs on a different machine at a
   different time, do I get the same output?" If the answer is no,
   there is an ambient input hiding in the call.

3. **Profiling quarantine check**:
   ```bash
   grep -rn "performance\.now\|Date\.now" src/domain/ --include="*.js" | grep -v eslint-disable
   ```
   Must return zero lines. Any remaining hits are profiling that
   leaked from adapter into domain.
