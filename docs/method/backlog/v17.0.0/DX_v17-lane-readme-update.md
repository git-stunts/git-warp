---
id: DX_v17-lane-readme-update
blocked_by:
  - DX_design-0018-flesh-out
blocks: []
---

# Add Shadow-Trie ORSet layers to lane README

## Problem

The v17.0.0 lane README tracks layers 0-5 for the TypeScript migration
and API redesign, plus an infrastructure parallel track. The Shadow-Trie
ORSet work has no representation in the lane yet.

## Fix

Add a new section to `docs/method/backlog/v17.0.0/README.md` with
ST-0 through ST-6 layers covering workspace scaffolding, ORSet seam,
trie foundation, ShadowTrieORSet, async firewall, kernel integration,
and broader package extraction.

## Scope

**In:** Lane README update only.

**Out:** Root README is not a backlog tracker.
