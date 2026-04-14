# Promote CHANGELOG [Unreleased] to [17.0.0]

**Audit ref:** DQ01-H-03, SR01-R1

All v17 changes sit under `[Unreleased]` (~130 lines). The release runbook
requires a dated `[17.0.0] — YYYY-MM-DD` section before tagging.

## Steps

1. Rename `## [Unreleased]` to `## [17.0.0] — 2026-04-14` (or target date).
2. Add a fresh `## [Unreleased]` section above it.
3. Verify `npm run release:preflight` check #4 passes.
