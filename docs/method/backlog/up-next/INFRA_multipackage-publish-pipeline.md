---
id: INFRA_multipackage-publish-pipeline
blocked_by: []
blocks:
  - INFRA_extract-warp-orset-package-post-publish
feature: tooling-release
---

# Design and implement the multi-package release pipeline

## Problem

The release machinery is still rooted in the top-level
`@git-stunts/git-warp` package. The workspace packages
`@git-stunts/warp-orset`, `@git-stunts/warp-kernel`, and
`@git-stunts/warp-adapters` exist, but they are private shells.

Before any workspace package can be flipped public and consumed by shipped root
code, release, preflight, tag guard, and version verification must support
publishing multiple packages from one repo tag.

## Release model

- One repo tag per release.
- All public package `version` fields equal the tag version.
- The release workflow publishes root plus every public workspace package from
  that single tag.
- Version lock is enforced across root and public workspaces.
- No per-package tag formats.

## Work items

- Extend release preflight to run package dry-runs for every public package.
- Extend publish workflow to publish every public workspace package from the
  same tag.
- Enforce lock-step versions across root and public workspace package files.
- Decide how JSR publication works for multiple packages before flipping a
  workspace package public.
- Update `docs/method/release.md` with the multi-package flow.

## Out of scope

- Moving ORSet, kernel, or adapter code.
- Flipping any specific workspace package public.
- Inventing per-package tags.

## Source

Rehomed from archived v17 residual note
`INFRA_multipackage-publish-pipeline`. The old `TS_publish-pipeline` blocker is
not carried forward; root package release preflight exists, and this is the
future multi-package successor.
