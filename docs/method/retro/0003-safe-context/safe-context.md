# Retrospective: 0003-safe-context

**Date:** 2026-04-01
**Type:** Design
**Outcome:** Hill met (pivoted to new repo)

## What happened

Design cycle for Graft — a context governor for coding agents.
Started from the code-nav pivot (cycle 0002) and iterated through
two full review rounds with APPROVE/REJECT/ENHANCE feedback.

The design doc went through three major evolutions:

1. **Initial draft** — command contracts, output shapes, test
   strategy, project structure. Tree-sitter for parsing, MCP + CLI
   for transport.

2. **Round 1 review** — closed all escape hatches. read_range
   bounded (250 lines / 20 KB), state_save capped (8 KB), dual
   thresholds (lines + bytes), built-in secret bans, machine-stable
   reason codes, project root definition, .graftignore.

3. **Round 2 review** — error vs refused distinction, broken-file
   best-effort outlines (partial: true), run_capture execution
   contract (cwd/env/timeout/log size), explicit CLI binary names,
   log retention, outline truncation metadata.

Final additions: enforcement hooks (PreToolUse on Read and Bash),
graft doctor/stats, internal vocabulary (projection, focus,
residual, receipt, witness), and the WARP optics framing.

Product named "Graft" — grafting semantic eyesight onto Git's
history substrate. Repo created at `flyingrobots/graft`, scaffolded
with METHOD.md, pushed to GitHub.

## Hill assessment

**Hill:** "An agent working in a JS/TS codebase can obtain the
minimum structurally correct context required to act — without
injecting large raw artifacts into long-lived conversation state."

**Status:** Design complete. The hill is fully specified with
command contracts, policy rules, enforcement layers, error models,
edge cases (broken files, secrets, symlinks), and test strategy.
Implementation begins as graft cycle 0001.

## Drift check

- Design doc lives in `docs/design/0003-safe-context/safe-context.md`
- Cool ideas logged in `docs/method/backlog/cool-ideas/DX_graft-cool-ideas.md`
- WARP provenance layer logged in `cool-ideas/PROTO_safe-context-warp-provenance-layer.md`
- CLEAN_CODE legend declared in `docs/method/legends/CLEAN_CODE.md`
- No code written. No test drift. No architecture drift.
- Cycle directory still named `0003-safe-context` (pre-rename to
  graft). Provenance preserved intentionally.

## Playback

### Agent

Design questions answered clearly:
- Command contracts with exact output shapes? **YES**
- All escape hatches bounded? **YES** (read_range, state, outline)
- Broken-file behavior specified? **YES** (best-effort, partial)
- Enforcement architecture defined? **YES** (MCP + hooks)
- Internal vocabulary coherent? **YES** (projection/focus/residual/receipt/witness)

### Human

- Does the design feel like a product? **YES** (per review: "first
  version that feels like a product instead of a clever utility")
- Are the governor's bounds tight? **YES** (per review: "stops
  feeling like a design sketch and starts feeling like a repo that
  wants to exist")
- Is the naming right? **YES** — Graft. Git has trees and branches.

## What we learned

1. **Data before design.** The Blacklight research transformed a
   nice utility into a real product. Without empirical evidence of
   96.2 GB Read burden, we would have built code-nav and missed 75%
   of the problem.

2. **Two review rounds caught real bugs.** Unrestricted read_range
   was a policy bypass. Unbounded state_save would recreate the
   problem in markdown. Flat line thresholds ignored byte-heavy
   files. These weren't obvious until someone said "the governor
   only works if it's hard to accidentally bypass."

3. **Internal vocabulary matters.** Naming the concepts (projection,
   focus, residual, receipt) gave the architecture coherence that
   made the review rounds productive instead of circular.

4. **Design cycles can spawn repos.** The Method worked across the
   boundary — design doc in git-warp, product in flyingrobots/graft.
   The cycle closes here; implementation opens there.

## New debt

None in git-warp.

## Cool ideas

Logged during cycle:
- graft pack, graft since, graft explain, graft init
- focus auto, capture handles, policy profiles (balanced/strict/feral)
- receipt mode, symbol heatmap, changed-since-last-read
- WARP provenance layer as Phase 3+ substrate

## Backlog impact

Implementation continues as graft repo cycle 0001.
`asap/DX_safe-context-phase-1.md` was consumed by this cycle's
design doc — no orphan backlog item remains.
