# 2026-03-28 — Architecture And CLI Guide Rewrite

Backlog: `OG-012`
Design: `docs/design/architecture-and-cli-guide-rewrite.md`

## What Landed

- rewrote `ARCHITECTURE.md` as a current system-boundary document instead of a stale `WarpGraph`-era overview
- rewrote `docs/CLI_GUIDE.md` around the shipped `WarpApp` setup flow and current CLI command families
- updated `docs/README.md` to treat architecture as part of the live docs corpus and removed the release-blocker callout
- added focused policy tests for architecture doc shape and CLI guide shape
- fixed the top-level CLI help text so `strand transfer-plan` is visible in the shipped command summary

## Design Alignment Audit

- architecture doc acts as system map, not front-door tutorial: `aligned`
- CLI guide teaches the current command workflows and current nouns: `aligned`
- docs index stops flagging these files as unresolved blockers once rewritten: `aligned`
- doc drift is pinned by executable policy checks: `aligned`

## Drift

- `aligned`

The slice did not discover new canonical release-blocker docs after these two rewrites landed.

## Why The Drift Happened

- none beyond the previously acknowledged stale docs carried forward from earlier public API transitions

## Resolution

- mark `OG-012` done
- keep `OG-010` active until the overall IBM public API cycle is closed and the release docs are reconciled for `v15`
