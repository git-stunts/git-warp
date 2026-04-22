---
title: "Extract warp-adapters only after the kernel and publish surfaces are real"
cycle: "0048-extract-warp-adapters-package"
---

# Extract Warp-Adapters Package

## Why this exists

With the trie-backed materialization line proven and `warp-adapters` scaffolded,
the next tempting move is to extract `src/infrastructure/adapters/` into
`packages/warp-adapters/`.

But that move depends on two boundaries already being real:

- the publish surface must support workspace package extraction
- `warp-kernel` must already exist as a publish-safe dependency surface

## Hill

A contributor can now answer:

- whether adapter extraction is actually honest today
- what concrete upstream work still blocks it
- what successor backlog item makes the extraction path truthful

## Design goals

1. Validate adapter extraction against the now-corrected package sequence.
2. Refuse a fake adapter package boundary if the kernel and publish surfaces are
   not yet real.
3. Leave the backlog more truthful than it was before the pull.

## Non-goals

- No code move into `packages/warp-adapters/` if the package would still be a
  costume.
- No accidental move of ports into adapters.

## Core diagnosis

Adapter extraction is downstream of kernel extraction, and kernel extraction is
itself deferred until the publish surface is real.

That means `INFRA_extract-warp-adapters-package` is not a ready execution slice.
It is another premise-validation cycle.

## Playback questions

### Agent

- Can I explain why adapters cannot extract before the publish-safe kernel
  boundary exists?
- Can I point to the backlog successor that makes the extraction sequence
  truthful?

### Human

- Is it clear why adapters extraction is later than kernel extraction, not just
  parallel package cleanup?

## Test plan

### Golden path

- design doc and retro record the blocked premise honestly
- replacement backlog item or dependency updates make the extraction tail more
  truthful

## Playback

### Witness

The premise check is backed by:

- [package.json](/Users/james/git/git-stunts/git-warp/package.json)
- [packages/warp-adapters/package.json](/Users/james/git/git-stunts/git-warp/packages/warp-adapters/package.json)
- [packages/warp-kernel/package.json](/Users/james/git/git-stunts/git-warp/packages/warp-kernel/package.json)
- [0047 retro](/Users/james/git/git-stunts/git-warp/docs/method/retro/0047-extract-warp-kernel-package/extract-warp-kernel-package.md)

### Agent

1. *Can I explain why adapters cannot extract before the publish-safe kernel boundary exists?*
   Yes. Adapters depend on kernel ports and contracts, so extracting adapters
   before kernel is publish-safe would only move the costume boundary one layer
   down.

2. *Can I point to the backlog successor that makes the extraction sequence truthful?*
   Yes. The successor is
   `INFRA_extract-warp-adapters-package-post-publish`, blocked by the
   multi-package publish pipeline and the post-publish kernel extraction.

### Human

1. *Is it clear why adapters extraction is later than kernel extraction, not just parallel package cleanup?*
   Yes. The adapter package cannot be honest until the kernel package is already
   a real dependency surface.

Verdict: not met. Premise invalid.

## Drift check

No accidental drift. The cycle simply corrected the backlog sequence.
