# No Ambient Time

## What must remain true?

Domain code (`src/domain/`) never reads wall-clock time, monotonic
timers, or any ambient temporal state. All timestamps in the domain
are either causal (tick numbers, version vectors, Lamport clocks)
or explicitly injected via parameters.

`Date.now()`, `new Date()`, `Date()`, and `performance.now()` are
forbidden in `src/domain/`.

## Why does it matter?

Ambient time is a hidden input. Hidden inputs break replay.

Paper III Theorem 4.1 (Computational Holography) guarantees that
`(U_0, P)` uniquely determines the interior worldline — but only if
patches eliminate ambiguity and avoid implicit dependence on ambient
state (Remark 3.4, Anti-tautology). If `removeNode` reads `Date.now()`
during patch construction, two replays of the same patch at different
wall-clock times produce different behavior. The holographic boundary
collapses.

Causal time (tick number, frontier, version vector) is the system's
real clock. It comes from the log, not the wall. Everything else is
weather.

## Paper grounding

- **Paper III, Theorem 4.1** (Computational holography): boundary
  encoding uniquely determines the interior.
- **Paper III, Remark 3.4** (Anti-tautology): patches must not
  depend on ambient state.
- **Paper II, Definition 4.5** (Scheduler policy): the scheduler
  is a total function of state, not of ambient context.

## How do you check?

1. **ESLint gate (enforced on every commit)**:
   ```
   no-restricted-syntax rules in eslint.config.js ban:
   - Date.now()
   - new Date()
   - Date()
   - performance.now()
   ```
   in all `src/domain/**/*.js` files.

2. **Manual audit for suppressions**:
   ```bash
   grep -rn "eslint-disable.*no-restricted-syntax" src/domain/ --include="*.js" | grep -i "date\|clock\|performance"
   ```
   Each suppression must have a tracked backlog item. Zero
   suppressions is the target state.

3. **Grep for escapes**:
   ```bash
   grep -rn "Date\.now\|new Date\|performance\.now" src/domain/ --include="*.js"
   ```
   Must return only eslint-disable-guarded lines (tracked debt)
   or zero lines (target state).
