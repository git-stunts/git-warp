# Retrospective: 0001-method-bootstrap

**Date:** 2026-04-01
**Type:** Design
**Outcome:** Hill met

## What happened

Introduced The Method as the development process framework for
git-warp. Created `METHOD.md` signpost, stood up the full directory
structure (`docs/method/backlog/` with 5 lane directories, `legends/`,
`retro/`, `graveyard/`), and migrated all existing backlog items.

49 B-number and OG items migrated from `BACKLOG/` to named files in
appropriate lanes. 10 tech debt entries from `.claude/bad_code.md`
became individual files in `bad-code/`. 13 cool ideas from
`.claude/cool_ideas.md` became individual files in `cool-ideas/`.
B-number headers stripped from all migrated files.

## Drift check

- `docs/release.md` moved to `docs/method/release.md` — CLAUDE.md
  reference updated.
- `docs/ROADMAP.md` still references old structure — updated
  migration notice.
- `.claude/bad_code.md` and `.claude/cool_ideas.md` replaced with
  forwarding notices.
- No code changes. No test impact. No drift.

## Playback

### Agent

- Can I find work by `ls` on a lane? **YES** — each lane is a
  directory with descriptive filenames.
- Can I classify a new idea without asking? **YES** — lane
  definitions are clear in METHOD.md.
- Do any B-numbers remain? **NO** — all stripped from headers and
  filenames. Git history preserves provenance.

### Human

- Does `ls docs/method/backlog/asap/` show what matters? **YES** —
  9 high-priority items with legend prefixes.
- Can I understand items from filenames? **YES** —
  `PROTO_strand-service-god-object.md` beats `B176.md`.
- Is BACKLOG/ gone? **YES** — `git rm -r BACKLOG/` done.

## New debt

None introduced.

## Cool ideas

None surfaced.
