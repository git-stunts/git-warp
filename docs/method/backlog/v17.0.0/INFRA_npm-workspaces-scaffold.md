---
id: INFRA_npm-workspaces-scaffold
blocked_by: []
blocks:
  - INFRA_extract-warp-orset-package
  - INFRA_extract-warp-kernel-package
  - INFRA_extract-warp-adapters-package
---

# Add npm workspace scaffolding for git-warp, warp-kernel, warp-adapters, warp-orset

## Problem

The repo is a single package. The Shadow-Trie ORSet design calls for
four packages: `git-warp` (product), `warp-kernel` (engine),
`warp-adapters` (infrastructure), `warp-orset` (ORSet engine). The
workspace structure must exist before packages can be extracted.

## Fix

Add npm `workspaces` field to root `package.json`. Create
`packages/{git-warp,warp-kernel,warp-adapters,warp-orset}/` with
skeleton `package.json`, `tsconfig.json`, and `src/index.ts` for each.
Verify the workspace build pipeline works end-to-end with a trivial
export from each package.

## Scope

**In:** Workspace scaffolding only. Skeleton packages with hello-world
exports. Shared tsconfig base. CI updated to build all workspaces.

**Out:** No code moves. No pnpm migration. No release-pipeline rewrite.
warp-kernel and warp-adapters are empty shells at this point.

## Notes

- The repo is npm-first in contributor setup and CI. Do not switch to
  pnpm in this slice.
- All packages version in lock step per monorepo policy.
