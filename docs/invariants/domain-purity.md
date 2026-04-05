# Domain Purity

## What must remain true?

Domain code (`src/domain/`) never imports infrastructure, Node.js
built-ins, host-specific APIs, or ambient mutable state. The domain
layer is a pure function of its inputs: patches in, state out.

## Why does it matter?

Paper III, Remark 3.4 (Anti-tautology) warns that the holographic
boundary is only information-complete when patches eliminate ambiguity
and avoid implicit dependence on ambient state. If domain code reads
`Date.now()`, `process.env`, `Math.random()`, or `crypto.randomUUID()`
during materialization, then replay is non-deterministic and the
holographic boundary guarantee collapses.

More broadly, hexagonal architecture (ports and adapters) ensures
that the domain layer is testable without infrastructure, portable
across runtimes (Node, Bun, Deno), and free from accidental coupling
to host-specific behavior.

## Paper grounding

- **Paper III, Remark 3.4** (Anti-tautology): patches must eliminate
  ambiguity and avoid implicit dependence on ambient state.
- **Paper II, Definition 4.5** (Scheduler policy): the scheduler is a
  total function of state, not of ambient context.
- **Paper IV, Definition 3.2** (Resource-bounded observer): observer
  implementations are parameterized by explicit budgets, not by
  ambient resources.

## How the codebase upholds it

- ESLint `no-restricted-globals` bans `Buffer` in `src/domain/**/*.js`,
  enforcing `Uint8Array` + helpers from `domain/utils/bytes.js`.
- Domain code uses dependency injection for all infrastructure
  concerns: `GraphPersistencePort`, `IndexStoragePort`, `LoggerPort`,
  `ClockPort`, `NeighborProviderPort`.
- `ClockAdapter.global()` uses `globalThis.performance` (available in
  all runtimes) rather than `node:perf_hooks`.
- `WebCryptoAdapter` uses `globalThis.crypto.subtle` rather than
  `node:crypto`.
- Domain utilities (`defaultClock.js`, `nullLogger.js`) provide
  domain-local defaults using standard APIs only.

## How do you check?

1. **Import audit**:
   ```bash
   grep -rn "require('node:" src/domain/ --include="*.js"
   grep -rn "from 'node:" src/domain/ --include="*.js"
   ```
   Must return zero hits.

2. **ESLint gate**: The `no-restricted-globals` rule for `Buffer` is
   enforced on every commit via the pre-commit hook. ESLint runs
   in CI on every PR.

3. **Multi-runtime test matrix**: The Docker test matrix runs unit
   tests on Node 22, Bun, and Deno. If domain code imported a
   Node-specific module, Bun/Deno tests would fail:
   ```bash
   npm run test:matrix
   ```

4. **Ambient state audit**:
   ```bash
   grep -rn "Date.now\|Math.random\|process.env\|process.cwd" src/domain/ --include="*.js"
   ```
   Must return zero hits in non-test files.
