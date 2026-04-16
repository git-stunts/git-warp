---
title: "Build the ORSet seam inside root (no code moves out of root)"
cycle: "0021-orset-seam-in-root"
design_doc: "docs/design/0021-orset-seam-in-root/orset-seam-in-root.md"
outcome: hill-met
drift_check: yes
---

# Cycle 0021 Retro — ORSet Seam in Root

**Status:** HILL MET

## Hill

Establish a root-local seam for warp-orset-destined code. Directory
layout mirrors the eventual warp-orset package structure. No code
moves out of root. No bare `@git-stunts/warp-orset` imports.

## What ground was taken

### Seam README

Created `src/domain/orset/README.md` documenting:

- **Current inventory**: which root files are destined for
  warp-orset (the existing `src/domain/crdt/*`)
- **Future layout**: planned subdirs under `src/domain/orset/`
  (route/, trie/, session/, shadow/, plus `ORSetLike.ts`) each
  mapped to its backlog item
- **Import rules**: no bare `@git-stunts/warp-orset` imports in
  root code, no relative imports into `packages/warp-orset/`
- **Extraction plan**: how `INFRA_extract-warp-orset-package-post-publish`
  will eventually move this code out

### Design 0018 updated

Added a "Seam in root" section pointing at the README and noting
cycle 0020's `not-met` outcome and the ST-7 split.

### No code moves

`src/domain/crdt/` stays where it is. Moving it to `src/domain/orset/`
now would force 208 import rewrites, followed by another 208 when
real extraction happens. Keeping `crdt/` at top level means one
rewrite total, not two. The seam boundary is conceptual, not
physical.

## Playback

### Agent

1. *Does `src/domain/orset/` exist?* Yes.
2. *Does its README document the boundary?* Yes — inventory, future
   layout, import rules, extraction plan.
3. *Were any existing files moved?* No.
4. *Were any imports rewritten?* No.
5. *Do root gates still pass?* Yes. `npm run typecheck` clean.
6. *Do future backlog items know where to land?* Yes — the README's
   "Future additions" table maps each planned subdir to its backlog
   item.

### Human

Deferred to review.

## Design decisions locked

- **`src/domain/crdt/` stays at top level, not under `orset/`**.
  Reason: double-rename cost (now + extraction) is not worth it when
  the seam is already clear.
- **New non-CRDT warp-orset code lands under `src/domain/orset/`**.
  Subdirs: route/, trie/, session/, shadow/.
- **`ORSetLike.ts`** lives at `src/domain/orset/ORSetLike.ts` (not
  under crdt/). The interface is warp-orset's seam, not a CRDT
  primitive.
- **No cross-package imports either direction**.

## Drift

- None. Scope stayed inside the "seam layout + documentation"
  boundary the backlog item defined.

## New debt

- None. The seam is documentation-only; it adds no maintenance
  burden until follow-on items populate it.

## What comes next

- `PROTO_orsetlike-contract` is unblocked. The interface lands at
  `src/domain/orset/ORSetLike.ts` per the seam README.
- `PROTO_blake3-route-key` is unblocked. It lands in
  `src/domain/orset/route/`.
- Both can proceed in parallel — the seam gave them clear homes
  without coupling them to the publish pipeline.

## Backlog maintenance

- [x] Seam README is the canonical guide for future ORSet items
- [x] Design 0018 references the seam
- [x] No dead backlog refs (PROTO_orset-seam-in-root was consumed
      by this cycle)
