---
id: PROTO_purge-import-law
cycle: 0025D
parent_cycle: 0025
blocked_by:
  - PROTO_purge-fake-models
---

# 0025D — Import law (guardrail establishment)

## Context from P6.5 contamination map

**Zero files** matched the 0025D detection rules:

- `ts-no-imports-from-infrastructure-in-core`: 0 hits
- `ts-no-imports-node-platform-in-core`: 0 hits

The hexagonal import wall between `src/domain/` / `src/ports/` and
everything else is **already maintained by convention** in current
code. This cycle is therefore a **guardrail-establishment** pass,
not a remediation effort.

That's exactly the right moment to codify the rule: lock the
invariant in before it ever gets violated, so it stays green
forever.

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
- `npm run lint` green (expected — zero pre-existing violations).
- `policy/quarantines/0025D-import-law.json` has `files: []`
  (already true, confirmed by P6.5 contamination map).

## Retro expectations

Cycle 0025D closes **immediately** on P7 rule activation:

- Outcome: `guardrail-established` (new status, since no
  remediation work was needed).
- Duration: one commit. No sub-campaigns.
- Purpose served: the rule is now mechanical policy, not
  convention. Future violations fail CI.

## Why codify now

The pattern where "it's always been clean" becomes "it was clean
until someone accidentally broke it" is how architectural
invariants erode. A rule that passes on day one with zero work
is the easiest rule to install and the most valuable one to keep.
