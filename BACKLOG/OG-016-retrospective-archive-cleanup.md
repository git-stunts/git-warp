# OG-016 — Archive retrospective clutter

Status: DONE

Legend: Observer Geometry

## Problem

The `docs/` tree contains dozens of retrospective files
(`docs/archive/retrospectives/2026-03-28-...`, design doc retros, etc.) that are
valuable for the team but clutter the documentation surface visible to
external contributors and evaluators.

The editor's report (2026-03-29) flagged this as the primary drag on
document cohesion (8/10 → could be 10/10).

## Desired outcome

Move retrospective and historical audit files into a dedicated archive
path so the `docs/` tree shows only active, forward-looking documentation.

Likely shape:

- `docs/archive/retrospectives/` for retrospective files
- `docs/archive/audits/` for historical audit transcripts (already partially
  exists)
- Update any cross-references that point into moved paths
- Keep design doc retros (`.retro.md`) co-located with their design docs —
  those are part of the active design record, not archive clutter

## Acceptance criteria

1. `docs/` top-level listing is clean and forward-looking.
2. No broken cross-references after the move.
3. Historical files remain reachable via archive path.

## Non-goals

- No content edits to the retrospective files themselves.
- No deletion of any retrospective — they all stay in the repo.
