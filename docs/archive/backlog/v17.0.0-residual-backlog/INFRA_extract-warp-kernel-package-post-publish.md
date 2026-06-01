---
id: INFRA_extract-warp-kernel-package-post-publish
blocked_by:
  - INFRA_multipackage-publish-pipeline
  - INFRA_extract-warp-orset-package-post-publish
blocks:
  - INFRA_extract-warp-adapters-package
feature: runtime-boundaries
---

# Extract warp-kernel as a real published workspace package (post-publish)

## Problem

Cycle `0047` attempted to extract `warp-kernel` from root and surfaced the same
publish-surface problem that blocked `warp-orset` in cycle `0020`:

- `@git-stunts/warp-kernel` is still a private workspace shell
- shipped root source cannot import it without breaking consumers
- relative imports into `packages/warp-kernel/` would make the package boundary
  a costume instead of a real extraction

This item is the deferred successor. It preserves the history of the invalid
premise instead of pretending the original extraction note is still truthful.

## Fix

After the multi-package publish pipeline exists and `warp-orset` is a real
package dependency, move kernel-owned services, controllers, state management,
and ports into `packages/warp-kernel/src/`, flip the package public, and make
root consume it through a publish-safe dependency boundary.

## Scope

**In:** Actual kernel code move. Root import rewrites. Package boundary freeze.

**Out:** Publish-pipeline design. ORSet package extraction. Adapter extraction.
