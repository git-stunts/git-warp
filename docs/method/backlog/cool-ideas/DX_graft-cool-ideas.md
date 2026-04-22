---
id: DX_graft-cool-ideas
blocked_by: []
blocks: []
---

# Graft cool ideas (post-Phase 1)

Ideas surfaced during the design review. Not Phase 1 scope.

## Commands

- **graft pack** — one-shot handoff bundle: WORKING_STATE.md, top
  touched files, last 10 decisions, recommended next reads. Great
  for `/clear`, bug reports, "what was I doing yesterday?"
- **graft since `<git-ref>`** — symbols changed since HEAD~1, main,
  or a specific commit. The Git/WARP bridge starts here.
- **graft explain `<reason-code>`** — built-in help for machine
  codes (`graft explain over_byte_threshold`)
- **graft init** — scaffolds `.graftignore`, `.gitignore` update,
  CLAUDE/GEMINI/Codex instruction snippets, optional hook install

## Features

- **focus: "auto"** — if intent mentions a symbol name, auto-promote
  it in next hints and optionally return focused outline first
- **capture_range(handle, start, end)** — opaque log handles instead
  of path-based artifacts. Cleaner, harder to misuse.
- **policy profiles** — `balanced`, `strict`, `feral`. Yes, feral
  is ridiculous. Yes, people will use it immediately.
- **receipt mode** — every decision emits a compact receipt blob for
  Blacklight: what was requested, returned, why, bytes avoided, what
  the agent did next
- **symbol heatmap** — after enough metrics, show which files/symbols
  most often trigger outlines, bounded reads, re-orientation. Gold
  for Phase 2 prioritization.

## The line to WARP

- **graft changed-since-last-read** — the doorway. Not Phase 1.
  This is where graft stops being a governor and starts being a
  substrate.
- Graft = governor at the edge (what context is allowed)
- WARP = memory underneath (structural truth over time)
- The mutation happens when "current file shape" stops being enough
  and you need observer-relative structural history as a primitive
