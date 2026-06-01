---
id: INFRA_extract-warp-adapters-package-post-publish
blocked_by:
  - INFRA_multipackage-publish-pipeline
  - INFRA_extract-warp-kernel-package-post-publish
blocks: []
feature: runtime-boundaries
---

# Extract warp-adapters as a real published workspace package

## Problem

`packages/warp-adapters/` exists, but it is still a private workspace shell.
Moving production adapter code behind `@git-stunts/warp-adapters` before the
publish pipeline and kernel boundary are real would create a fake package
boundary and break consumers.

## Fix

After the multi-package publish pipeline exists and `warp-kernel` is a real
published dependency, move infrastructure adapters into
`packages/warp-adapters/src/`, flip the package public, and make root consume
it through a publish-safe dependency boundary.

## Acceptance

- `packages/warp-adapters/package.json` is public and participates in the
  lock-step release pipeline.
- Root source imports adapter code through the published package boundary.
- No shipped root source reaches into `packages/warp-adapters/` through
  relative imports.
- Root package metadata declares the dependency explicitly.
- Tests and docs prove the adapter package is not just a private workspace
  costume.

## Source

Rehomed from archived v17 residual note
`INFRA_extract-warp-adapters-package-post-publish`.
