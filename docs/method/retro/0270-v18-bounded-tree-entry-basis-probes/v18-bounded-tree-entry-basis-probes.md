# 0270 Bounded Tree-Entry Basis Probes Retro

## Outcome

PERF-0270 replaced checkpoint-tail basis verification's full tree OID map read
with focused tree-entry probes. `CheckpointTailBasisVerifier` now verifies
`frontier.cbor` and `index` evidence through bounded probe results, and
first-use Optics setup rejects accidental `readTreeOids(...)` use.

This closes the residual verifier dependency tracked by #575 and implements
the bounded tree-entry probe shape from #577. It does not close #549: normal
public reads, writes, content lookup, sync, and end-to-end memory-budget
conformance remain the v18 bounded-memory gate.

## What Changed

- Added runtime-backed tree-entry path, limit, found, missing, and prefix batch
  nouns.
- Added `TreeEntryProbePort` as a focused probe port rather than changing the
  legacy `readTreeOids(...)` full-map contract.
- Implemented probe behavior in the in-memory and Git-backed adapters.
- Moved `CheckpointTailBasisVerifier` from `readTreeOids(...)` to exact
  `frontier.cbor` and `index` probes, with bounded `index/` prefix evidence
  fallback.
- Updated `worldline.prepareOpticBasis()` cost inventory wording while keeping
  the surface `transitional` until #549 closes.

## Witness

Focused witness:

```bash
npx vitest run test/unit/domain/services/optic/CheckpointTailBasisVerifier.test.ts test/conformance/v18FirstUseOpticsHonesty.test.ts test/unit/infrastructure/adapters/InMemoryGraphAdapter.test.ts test/unit/infrastructure/adapters/GitGraphAdapter.coverage.test.ts
```

Full local witness:

```bash
npm run typecheck
npm run lint
npm run lint:sludge
npm run lint:quarantine-graduate
npm run lint:md
npm run lint:md:code
npm run test:local
```

Push witness:

```text
IRONCLAD M9 — all gates passed. Push authorized.
```

## What The Tests Proved

- The verifier succeeds when `readTreeOids(...)` is forbidden and tree-entry
  probes are available.
- Missing frontier and missing index evidence still fail closed with
  `E_OPTIC_NO_BOUNDED_BASIS`.
- First-use Optics setup fails if it calls `readTreeOids(...)`.
- Git prefix parsing stops when the runtime limit is reached.
- A checkpoint tree with 4,096 unrelated entries is verified by probing only
  `frontier.cbor` and `index`.

## Remaining Work

#549 remains open for the bounded-memory product gate. The work still needed
there includes normal public read fact resolvers, write-path boundedness,
bounded content-reference lookup, cursorized sync, capability reporting,
operator doctor tooling, bounded-mode legacy rejection, and release evidence.

## PR

- https://github.com/git-stunts/git-warp/pull/579
