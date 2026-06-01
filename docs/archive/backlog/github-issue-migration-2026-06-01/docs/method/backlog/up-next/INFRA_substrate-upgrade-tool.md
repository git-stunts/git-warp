---
id: INFRA_substrate-upgrade-tool
blocked_by: []
blocks: []
feature: runtime-boundaries
---

# Make the substrate upgrader the compatibility boundary

## Problem

`npm run upgrade` exists and currently builds then runs
`dist/scripts/upgrade-v16-to-v17.js`, with versioned migration helpers under
`scripts/migrations/v17.0.0/`.

That is a start, but the production runtime still carries legacy substrate
fallbacks. If those stay in `src/`, old storage shapes become permanent
mainline behavior instead of migration-only compatibility.

## Current cleanup targets

- `src/infrastructure/adapters/CasBlobAdapter.ts` raw blob restore fallback.
- `src/infrastructure/adapters/CasPayloadPointer.ts` accepting non-pointer
  payload bytes as current payload truth.
- `src/infrastructure/adapters/CborPatchJournalAdapter.ts` legacy Git-blob and
  legacy external-storage read routes.
- `src/infrastructure/adapters/GitTrustChainAdapter.ts` pre-CAS raw record
  fallback reads.

## Acceptance

- The upgrade path is version-aware, idempotent, and dry-run capable.
- Legacy readers needed for v16/v17 substrate translation live under
  `scripts/migrations/v17.0.0/`, not production runtime code.
- Production runtime code supports the current substrate path without raw
  substrate fallback branches.
- The command or script reports what changed and what still needs operator
  action.
- Tests prove rerun safety and at least one realistic legacy-to-current
  migration path.

## Source

Rehomed from archived v17 residual note `INFRA_substrate-upgrade-tool`. The old
`INFRA_git-cas-adapter-parity` blocker is not carried forward because the v17
release ledger marks that parity work complete.
