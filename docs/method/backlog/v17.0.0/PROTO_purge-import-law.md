---
blocks: []
id: PROTO_purge-import-law
cycle: 0025D
parent_cycle: 0025
blocked_by:
  - PROTO_purge-fake-models
feature: runtime-boundaries
---

# 0025D — Import law

## Context from P6.5 contamination map

**Three files** matched the 0025D detection rules after the P7
scanner-regex fix:

- `src/ports/CommitPort.ts` — imports `type { Readable } from
  'node:stream'`
- `src/ports/GraphPersistencePort.ts` — imports
  `type { Readable } from 'node:stream'`
- `src/domain/utils/defaultCrypto.ts` — imports `node:crypto` or
  `crypto` directly

The hexagonal import wall is **mostly** maintained by convention.
Two ports leak `node:stream` as a type surface; one domain utility
reaches directly for platform crypto.

## Scanner-regex note

Until the P7 scanner fix, these three files were false-negatives —
the contamination scanner's `node:` protocol regex required a
trailing `/` or quote immediately after the colon, missing the
form `'node:stream'`. The fix extended the regex to match
`node:<name>` and `node:<name>/<sub>` forms. The ESLint
`no-restricted-imports` rule (which matches exact module names)
caught the violations correctly; the scanner caught up.

## Fix

### CommitPort / GraphPersistencePort

Define a domain stream abstraction at `src/domain/stream/` (or
reuse `WarpStream`) that matches the `Readable` contract the ports
need. Replace `type { Readable }` with that domain type. The
adapter layer converts between `node:stream.Readable` and the
domain type at the boundary.

### defaultCrypto.ts

Either:

- Move the file into `src/infrastructure/adapters/` since its
  entire purpose is boundary I/O against platform crypto.
- Or expose a `CryptoPort` interface in `src/ports/` and an adapter
  implementation in `src/infrastructure/adapters/`. Domain code
  receives the port, not the module.

The second option aligns with the existing port-driven
architecture and is preferred.

## Fix

Enable ESLint's `no-restricted-imports` on `src/domain/**` and
`src/ports/**` with the following groups banned:

**Adapter-path imports:**

- `**/infrastructure/**`
- Relative paths traversing into `infrastructure/`

**Platform APIs:**

- `node:*` (any `node:` protocol import)
- `fs`, `path`, `http`, `https`, `net`, `tls`, `stream`,
  `child_process`, `crypto`, `os`, `buffer`
- `node:fs`, `node:path`, etc. (redundant with `node:*`, explicit
  for safety)

**Framework libraries (defensive — most we don't use but cheap to
list):**

- `express`, `fastify`, `next`, `next/*`
- `@prisma/client`, `pg`, `mysql2`, `mongodb`
- `axios`, `ky`
- `zod`, `valibot`, `io-ts`

**Allowed residue in domain/ports:**

- Own domain types and ports (relative imports within `src/`).
- Pure, platform-agnostic npm packages that do not reach I/O
  (e.g. `@noble/hashes`, `@ipld/dag-cbor`). Audited at
  dependency-update time.

## Scope

**In:**
- ESLint `no-restricted-imports` rule activation for `src/domain/**`
  and `src/ports/**`.
- Corresponding Semgrep / contamination-scanner rules
  (already staged; activate on P7 landing).

**Out:**
- Remediation (none needed — zero contamination).
- Import-hygiene migrations (`verbatimModuleSyntax`, barrel
  consolidation) — separate future cycles.

## Exit criteria

- ESLint rule active on `src/domain/**` and `src/ports/**`.
- `npm run lint` green (new violations rejected).
- `policy/quarantines/0025D-import-law.json` has `files: []`
  (three files graduated).

## Retro expectations

- Document the domain stream type introduced or reused.
- Document the `CryptoPort` added (or decision to relocate
  `defaultCrypto.ts` into adapters).
- Note whether the scanner regex fix surfaced other false
  negatives during the purge.
