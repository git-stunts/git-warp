# 2026-03-28 — Release Policy Reconciliation

Design: `docs/design/release-policy-reconciliation.md`

## What Landed

- aligned `jsr.json` to `15.0.0` so release metadata matches the intended branch version
- updated `scripts/release-preflight.sh` to stop requiring a removed README release-feed section
- updated `docs/release.md` to reflect the actual branch -> PR -> merge -> tag release flow
- updated `.github/workflows/release.yml` to stop enforcing README `What's New`
- updated `ROADMAP.md` header to distinguish the current release on `main` from the unreleased `v15` branch state
- added static policy coverage for the release path and metadata alignment

## Design Alignment Audit

- version metadata matches the intended `v15` branch line: `aligned`
- release chronology lives in `CHANGELOG.md` rather than a README release feed: `aligned`
- the normal PR loop is part of the documented release path: `aligned`
- roadmap header distinguishes shipped `main` from unreleased branch intent: `aligned`

## Drift

- `aligned`

## Why The Drift Happened

- the public API and docs cycle moved faster than the older release policy artifacts
- the README intentionally dropped the release feed before the release tooling caught up

## Resolution

- keep the release policy locked by static tests
- finish the remaining `OG-010` close-out and then open the PR to `main`
