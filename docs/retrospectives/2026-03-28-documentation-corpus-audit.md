# 2026-03-28 — Documentation Corpus Audit

Backlog: `OG-012`
Design: `docs/design/documentation-corpus-audit.md`

## What Landed

- added a documentation index at `docs/README.md`
- added an archive index at `docs/archive/README.md`
- added a maintainer-facing documentation guide at
  `docs/dev/documentation/style-guide.md`
- moved obvious historical clutter out of top-level `docs/`
- grouped trust docs under `docs/trust/`
- added executable policy coverage for the docs taxonomy

## Design Alignment Audit

- docs taxonomy is explicit: `aligned`
- top-level docs surface favors current docs over archaeology: `aligned`
- historical documents are archived instead of silently discarded: `aligned`
- documentation governance has a canonical maintainer-facing home: `aligned`
- release-blocking doc drift is identified honestly: `aligned`
- all canonical docs are already reconciled to `v15`: `not aligned`

## Drift

Two important docs are still not fully reconciled to the current public API:

- `ARCHITECTURE.md`
- `docs/CLI_GUIDE.md`

This slice classified that drift and reduced corpus confusion, but it did not
rewrite those files yet.

## Why The Drift Happened

- deliberate scoping

The point of this slice was corpus taxonomy and cleanup, not a full rewrite of
every canonical document.

## Resolution

- keep `OG-010` active until the remaining canonical docs are reconciled
- treat `ARCHITECTURE.md` and `docs/CLI_GUIDE.md` as release blockers for `v15`
