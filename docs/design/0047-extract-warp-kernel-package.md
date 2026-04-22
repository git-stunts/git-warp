---
title: "Extract warp-kernel only if the package boundary is publish-safe"
cycle: "0047-extract-warp-kernel-package"
---

# Extract Warp-Kernel Package

## Why this exists

The shadow-trie line is now proven enough that the next tempting move is to
extract the engine into `packages/warp-kernel/`.

That sounds mechanical:

- move domain services and controllers into the package
- rewrite imports
- keep the root product package as a thin shell

But cycle `0020` already taught the repo one painful lesson: package
extraction is not honest unless the publish surface can carry the moved code.

## Hill

A contributor can now answer:

- whether `warp-kernel` extraction is actually publish-safe today
- what exact package-boundary trap blocks a real move if it is not
- what replacement backlog item or sequencing change makes the next move honest

## Design goals

1. Validate the extraction premise against the current publish surface.
2. Refuse a fake package boundary if the root product cannot ship the moved
   files safely.
3. If the premise is invalid, file the correct successor work instead of
   forcing the move anyway.

## Non-goals

- No costume extraction through cross-package relative imports.
- No private-package import bomb in shipped root source.
- No adapter extraction in this cycle.

## Core diagnosis

`@git-stunts/git-warp` is the published product package.
`@git-stunts/warp-kernel` is still private workspace scaffolding.

If root shipped source rewrites imports to `@git-stunts/warp-kernel`, consumers
of `@git-stunts/git-warp` cannot resolve them. If root shipped source imports
`packages/warp-kernel/...` relatively, the package boundary is just a costume.

That makes this cycle a premise-validation slice first, not a blind move.

## Playback questions

### Agent

- Can I explain exactly why a naive extraction would break the publish surface?
- Can I point to the evidence that `warp-kernel` is still a private workspace
  shell rather than a publish-safe dependency?
- If the premise is invalid, can I point to the replacement backlog shape?

### Human

- Is it clear whether kernel extraction is real work or just package cosplay
  right now?
- If the move is deferred, is the reason concrete rather than hand-wavy?

## Test plan

### Golden path

- design doc and retro capture a truthful yes/no answer on publish-safe
  extraction
- if extraction is blocked, replacement backlog items or dependency updates make
  the lane more honest than it was before the pull

### Known failure modes

- cycle forces a code move even though the root package cannot ship the new
  imports
- cycle closes without leaving a clearer successor path than it started with

## Playback

### Witness

The premise check is backed by:

- [package.json](/Users/james/git/git-stunts/git-warp/package.json)
- [packages/warp-kernel/package.json](/Users/james/git/git-stunts/git-warp/packages/warp-kernel/package.json)
- [src/domain/orset/README.md](/Users/james/git/git-stunts/git-warp/src/domain/orset/README.md)
- [0020 retro](/Users/james/git/git-stunts/git-warp/docs/method/retro/0020-extract-warp-orset-package/extract-warp-orset-package.md)

### Agent

1. *Can I explain exactly why a naive extraction would break the publish surface?*
   Yes. Root shipped `.ts` cannot import a private workspace package safely, and
   relative imports into `packages/warp-kernel` would only costume the package
   boundary.

2. *Can I point to the evidence that `warp-kernel` is still a private workspace shell rather than a publish-safe dependency?*
   Yes. The package is still `private: true`, and root publish config does not
   treat it as a shipped dependency surface.

3. *If the premise is invalid, can I point to the replacement backlog shape?*
   Yes. The successor is
   `INFRA_extract-warp-kernel-package-post-publish`, blocked by the
   multi-package publish pipeline and the real `warp-orset` extraction.

### Human

1. *Is it clear whether kernel extraction is real work or just package cosplay right now?*
   Yes. Without a publish-safe boundary, it is cosplay.

2. *If the move is deferred, is the reason concrete rather than hand-wavy?*
   Yes. The blocker is the same publish-surface trap already documented by cycle
   `0020`, not a vague lack of readiness.

Verdict: not met. Premise invalid.

## Drift check

Negative drift from the original backlog wording, but truthful drift.

The original note framed this as a mechanical move after the ORSet/materialize
seams were proven. That skipped the publish-surface requirement. This cycle
corrects the sequencing instead of forcing a fake extraction.
