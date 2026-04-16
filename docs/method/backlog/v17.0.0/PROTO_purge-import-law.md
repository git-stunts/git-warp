---
id: PROTO_purge-import-law
cycle: 0025D
parent_cycle: 0025
blocked_by:
  - PROTO_purge-fake-models
---

# 0025D — Import law

## Problem

The repository's hexagonal architecture is documented in
`AGENTS.md` and `SYSTEMS_STYLE_TYPESCRIPT.md`, but the import walls
are maintained by convention only. There is no mechanical enforce-
ment that `src/domain/**` never imports `src/infrastructure/**`,
nor that platform APIs (`node:*`, `fs`, `http`, etc.) stay out of
core.

Without enforcement, the discipline decays silently. A single
accidental `import fs from 'node:fs'` in a domain service survives
review, spreads, and undermines every other architectural claim
we make.

## Fix

Enable ESLint's `no-restricted-imports` on `src/domain/**` and
`src/ports/**` with the following groups banned:

**Adapter-path imports:**
- `**/infrastructure/**`
- `../infrastructure/**`

**Platform APIs:**
- `node:*` (any `node:` protocol import)
- `fs`, `path`, `http`, `https`, `net`, `tls`, `stream`,
  `child_process`, `crypto`, `os`, `buffer`
- `node:fs`, `node:path`, etc. (redundant with `node:*` but
  explicit for safety)

**Framework libraries (defensive — most we don't use but cheap to
list):**
- `express`, `fastify`, `next`, `next/*`
- `@prisma/client`, `pg`, `mysql2`, `mongodb`
- `axios`, `ky`
- `zod`, `valibot`, `io-ts`

**Allowed residue in domain/ports:**
- Our own domain types and ports (relative imports).
- Pure, platform-agnostic npm packages that do not reach I/O (e.g.
  `@noble/hashes`, `@ipld/dag-cbor`). These are audited at
  dependency-update time, not lint time.

## Scope

**In:**
- Every file listed in
  `policy/quarantines/0025D-import-law.json`.
- Adjustments to ESLint `no-restricted-imports` groups as new
  offending patterns surface during purge.
- Any refactor required to route forbidden imports through ports
  instead of direct calls.

**Out:**
- Import-hygiene migrations not related to architecture
  (`verbatimModuleSyntax`, barrel-file consolidation) — separate
  cycles.

## Exit criteria

- `policy/quarantines/0025D-import-law.json` has `files: []`.
- ESLint `no-restricted-imports` rules on `src/domain/**` and
  `src/ports/**` are active and green.
- Platform API access (time, randomness, filesystem, network, env)
  in domain code is mediated by ports exclusively.

## Retro expectations

- Any port introduced or widened to replace a direct platform
  import is recorded.
- Any direct-call escape that survived unnoticed before this cycle
  is named — it's evidence of where the wall was permeable.
