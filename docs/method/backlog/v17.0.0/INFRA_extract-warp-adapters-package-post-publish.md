---
id: INFRA_extract-warp-adapters-package-post-publish
blocked_by:
  - INFRA_multipackage-publish-pipeline
  - INFRA_extract-warp-kernel-package-post-publish
blocks: []
feature: runtime-boundaries
---

# Extract warp-adapters as a real published workspace package (post-publish)

## Problem

Cycle `0048` surfaced the honest sequence: adapter extraction cannot happen
until both the publish surface and the kernel boundary are real.

## Fix

After the multi-package publish pipeline exists and `warp-kernel` is a real
package dependency, move infrastructure adapters into
`packages/warp-adapters/src/`, flip the package public, and make root consume
it through a publish-safe dependency boundary.

## Scope

**In:** Actual adapter move. Root import rewrites. Package boundary freeze.

**Out:** Publish-pipeline design. Kernel extraction. ORSet extraction.
