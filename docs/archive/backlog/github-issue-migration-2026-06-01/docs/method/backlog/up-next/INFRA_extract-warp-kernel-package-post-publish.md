---
id: INFRA_extract-warp-kernel-package-post-publish
blocked_by:
  - INFRA_multipackage-publish-pipeline
  - INFRA_extract-warp-orset-package-post-publish
blocks:
  - INFRA_extract-warp-adapters-package-post-publish
feature: runtime-boundaries
---

# Extract warp-kernel as a real published workspace package

## Problem

`packages/warp-kernel/` exists, but it is still a private workspace shell.
Root source cannot safely import `@git-stunts/warp-kernel` until the package is
published in lock step with root and its lower-level dependencies are real.

Cycle 0047 already found the bad version of this work: a private package shell
or relative imports into `packages/warp-kernel/` would make the boundary a
costume instead of an extraction.

## Fix

After the multi-package publish pipeline exists and `warp-orset` is a real
published dependency, move kernel-owned services, controllers, state
management, and ports into `packages/warp-kernel/src/`, flip the package
public, and make root consume it through a publish-safe dependency boundary.

## Acceptance

- `packages/warp-kernel/package.json` is public and participates in the
  lock-step release pipeline.
- Root code imports kernel-owned modules through the published package
  boundary.
- No shipped root code reaches into `packages/warp-kernel/` by relative path.
- Adapter code remains out of `warp-kernel`.
- The package boundary is covered by build, typecheck, package dry-run, and
  consumer-type checks.

## Source

Rehomed from archived v17 residual note
`INFRA_extract-warp-kernel-package-post-publish`.
