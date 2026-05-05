---
title: "Create packages/warp-orset and move reusable ORSet primitives"
cycle: "0020-extract-warp-orset-package"
design_doc: "docs/design/0020-extract-warp-orset-package/extract-warp-orset-package.md"
outcome: not-met
drift_check: yes
---

# Cycle 0020 Retro — Extract warp-orset Package

**Status:** NOT MET — deferred. Premise invalid.

## Hill

Move `src/domain/crdt/{ORSet,Dot,VersionVector,LWW}.ts` into
`packages/warp-orset/src/` and rewrite all import paths to use the
workspace package.

## Why the hill could not be taken

Scoping the move surfaced a critical publish-surface problem:

- Per Cycle 0019, `@git-stunts/warp-orset` is `private: true`.
- If cycle 0020 moves the crdt primitives into warp-orset and root
  code imports `@git-stunts/warp-orset/ORSet` in shipped `.ts` files,
  consumers of `@git-stunts/git-warp` cannot resolve the import — the
  package is private, it isn't published anywhere.
- Making warp-orset public requires a real multi-package release
  pipeline: root + workspace packages published in lock step from a
  single repo tag, `release.yml` / `release-pr.yml` / `verify` script
  updated, JSR workspace support researched. That is a dedicated
  cycle's worth of work, not a casual follow-on to an "extract" slice.

Forcing the extraction without a publish story produces exactly one
of three bad outcomes:

1. **Private-package import bomb** in published source — consumers
   break.
2. **Fake relative imports** across package boundaries — the package
   is a costume, not a boundary.
3. **Breaking the 0019 scaffold intent** by flipping warp-orset public
   without the release pipeline work — release breakage on next tag.

## What was learned

- Design 0018 treated extraction as a mechanical rename. It isn't.
  Extracting a workspace package from a published npm package
  requires a publish story before any code moves.
- 0019's decision to keep all workspace packages private was correct
  — but the follow-on "extract warp-orset" item inherited the
  assumption that privacy was compatible with real extraction. It
  isn't.
- "Extract a package" is actually two distinct slices:
  1. Build the seam inside root (file layout, interface, consumer
     retyping) — no publish/release work needed.
  2. Flip the seam into a real workspace package — requires a
     multi-package release pipeline first.

## Playback

### Agent

1. *Was the crdt/ directory moved?* No.
2. *Were any imports rewritten?* No.
3. *Was any configuration changed?* No.
4. *Is the scaffold from 0019 still intact?* Yes.

### Human

Deferred. The cycle did not execute code changes — just surfaced
the blocker.

## What comes next

Three new backlog items replace this cycle:

1. `PROTO_orset-seam-in-root` — build the ORSet seam inside root
   (file layout mimics future warp-orset, no cross-package imports,
   no code moves out of root yet).
2. `INFRA_multipackage-publish-pipeline` — design and implement the
   multi-package release story. Blocked by existing
   `TS_publish-pipeline`. One repo tag, lock-step versions, no
   per-package tag formats.
3. `INFRA_extract-warp-orset-package-post-publish` — the actual
   extraction, deferred until the publish pipeline exists and the
   ORSet API is stable. Deliberately new ID — not reusing
   `INFRA_extract-warp-orset-package` to keep backlog history clean.

`PROTO_orsetlike-contract` updated to depend on
`PROTO_orset-seam-in-root` instead of the closed extraction item.

## Drift

- **Unplanned outcome**: cycle closed without code changes. This is
  correct — the correct action on an invalid premise is to reject it,
  not to execute it anyway.

## New debt

- None. The deferred work is now properly decomposed in backlog.

## Backlog maintenance

- [x] Original item (`INFRA_extract-warp-orset-package`) removed from
      backlog when the cycle was pulled
- [x] Three replacement items filed with clear scope separation
- [x] `PROTO_orsetlike-contract` dependency updated
- [x] Lane README updated to reflect new structure
