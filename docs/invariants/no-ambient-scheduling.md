# No Ambient Scheduling

## What must remain true?

Domain code (`src/domain/`) never schedules its own work via
`setTimeout`, `setInterval`, `queueMicrotask`, or
`requestAnimationFrame`. The domain is a pure function of its
inputs — it does not decide when to run.

If domain behavior needs to be triggered on a timer (e.g., polling
for frontier changes), the timer lives in an adapter or the caller.
The domain exposes a method; the adapter calls it on a schedule.

## Why does it matter?

Timers are ambient scheduling state. They introduce:

- **Non-determinism**: test outcomes depend on timer resolution
- **Hidden concurrency**: callbacks fire at unpredictable times
- **Untestable coupling**: tests must mock `setInterval` or use
  fake timers to control behavior
- **Replay impossibility**: replaying a worldline cannot re-ask
  the universe when to wake up

If correctness depends on timer cadence, the system is
non-deterministic. If a heartbeat timeout fires, that should be
a `TimeoutFired(timerId)` event appended to the causal log — not
a `setInterval` callback mutating domain state.

## Paper grounding

- **Paper II, Definition 4.5** (Scheduler policy): the scheduler
  is a total function of state. Timer-driven callbacks make the
  scheduler a function of ambient runtime state.
- **Paper IV, Definition 3.2** (Resource-bounded observer):
  observer budgets are explicit parameters, not ambient resources.

## How do you check?

1. **ESLint gate (enforced on every commit)**:
   ```
   no-restricted-syntax rules in eslint.config.js ban:
   - setTimeout
   - setInterval
   ```
   in all `src/domain/**/*.js` files.

2. **Grep for escapes**:
   ```bash
   grep -rn "setTimeout\|setInterval\|queueMicrotask" src/domain/ --include="*.js"
   ```
   Must return only eslint-disable-guarded lines (tracked debt)
   or zero lines (target state).

3. **Architecture check**: Any polling or timer-based feature must
   have the timer in `src/infrastructure/` or in the caller, with
   the domain exposing a synchronous or async method that the timer
   invokes.
