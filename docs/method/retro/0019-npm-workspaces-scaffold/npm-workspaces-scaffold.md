---
title: "Add npm workspace scaffolding for git-warp, warp-kernel, warp-adapters, warp-orset"
cycle: "0019-npm-workspaces-scaffold"
design_doc: "docs/design/0019-npm-workspaces-scaffold/npm-workspaces-scaffold.md"
outcome: hill-met
drift_check: yes
---

# Cycle 0019 Retro — npm Workspaces Scaffold

**Status:** HILL MET

## Hill

Add npm workspace scaffolding for the 4-package topology from Design
0018 without moving code, without touching the release pipeline, and
without breaking any existing root gates.

## What ground was taken

### Workspace topology

- Root stays as the published `@git-stunts/git-warp` package —
  unchanged `name`, `version`, `exports`, `bin`, `files`, `jsr.json`.
- Added `"workspaces": ["packages/*"]` to root `package.json`.
- Created 3 private skeleton packages:
  - `@git-stunts/warp-orset` (private)
  - `@git-stunts/warp-kernel` (private)
  - `@git-stunts/warp-adapters` (private)

### Per-package shape

Each package has:
- `package.json` — private, type:module, engines Node >=22, scripts
  for typecheck + lint (no test for empty skeletons)
- `tsconfig.json` — extends `../../tsconfig.base.json`
- `src/index.ts` — trivial version constant export

### Supporting changes

- `eslint.config.js` — added `"packages/**/node_modules/**"` to global
  ignores as a defensive measure
- `scripts/hooks/pre-commit` — fixed stale `.js` reference left over
  from the TS migration (was calling `node scripts/ts-policy-check.js`
  but only the `.ts` version exists). Every commit since the TS
  migration would have failed the pre-commit hook had anyone noticed.

## What was NOT done (by design)

- No `packages/git-warp` — the root owns that identity. Creating an
  empty skeleton with the same name is monorepo cosplay.
- No code moves — existing src/, bin/, test/ untouched.
- No release pipeline changes — CI, release-pr, release workflows
  still root-scoped and unchanged.
- No public workspace packages — all three marked `private: true`.
  Making any of them public requires a deliberate multi-package
  release story, which is a later slice.
- No pnpm.

## Playback

### Agent

1. *Does `npm install` succeed?* Yes. Lockfile regenerated cleanly.
2. *Does `npm ls --workspaces` show all 3 packages?* Yes —
   `@git-stunts/warp-adapters`, `@git-stunts/warp-kernel`,
   `@git-stunts/warp-orset` all linked via symlinks.
3. *Do root gates still pass?* Yes. Root typecheck green. Root lint
   unchanged (80 pre-existing errors in bin/cli/ documented but not
   caused by this cycle). Root tests pass (1 pre-existing .DS_Store
   test failure documented).
4. *Do workspace-local typechecks pass?*
   `npm run typecheck -w @git-stunts/warp-orset` — green.
   `npm run typecheck -w @git-stunts/warp-kernel` — green.
   `npm run typecheck -w @git-stunts/warp-adapters` — green.
5. *Is it honestly documented that root gates do NOT cover packages?*
   Yes. Commit message and retro explicitly state that root
   `tsconfig.src.json` and vitest coverage only include root `src/`.
   Workspace package code must be verified via workspace-local
   scripts.

### Human

Deferred to review.

## Drift

- **Unplanned fix**: `scripts/hooks/pre-commit` called `.js` instead of
  `.ts`. Pre-existing bug, not caused by this cycle, but blocked the
  commit. Fixed in the same commit with explicit mention in the
  message.

## New debt

- None. All 3 placeholder packages are tracked in Design 0018 backlog
  (INFRA_extract-warp-orset-package, INFRA_extract-warp-kernel-package,
  INFRA_extract-warp-adapters-package).

## What comes next

The ORSet seam work is now unblocked:

- `PROTO_orsetlike-contract` (blocked_by: INFRA_extract-warp-orset-package)
  can proceed once the ORSet primitives are moved into warp-orset.
- `INFRA_extract-warp-orset-package` is the next pull — it moves
  `src/domain/crdt/{ORSet,Dot,VersionVector}.ts` into the
  `warp-orset` package.

Alternatively, `PROTO_blake3-route-key` has no dependencies and can
start in parallel.

## Backlog maintenance

- [x] Inbox processed (no new inbox items introduced)
- [x] Priorities reviewed (ST-0 complete, ST-1 unblocked)
- [x] Dead work buried or merged (DX_design-0018-flesh-out and
      DX_v17-lane-readme-update retired in prior commits)
