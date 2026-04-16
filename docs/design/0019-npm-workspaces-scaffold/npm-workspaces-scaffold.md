---
title: "Add npm workspace scaffolding for git-warp, warp-kernel, warp-adapters, warp-orset"
legend: "INFRA"
cycle: "0019-npm-workspaces-scaffold"
source_backlog: "docs/method/backlog/v17.0.0/INFRA_npm-workspaces-scaffold.md"
---

# Add npm workspace scaffolding for git-warp, warp-kernel, warp-adapters, warp-orset

Source backlog item: `docs/method/backlog/v17.0.0/INFRA_npm-workspaces-scaffold.md`
Legend: INFRA

## Sponsors

- Human: Backlog operator
- Agent: Implementation agent

## Hill

TBD

## Playback Questions

### Human

- [ ] TBD

### Agent

- [ ] TBD

## Accessibility and Assistive Reading

- Linear truth / reduced-complexity posture: TBD
- Non-visual or alternate-reading expectations: TBD

## Localization and Directionality

- Locale / wording / formatting assumptions: TBD
- Logical direction / layout assumptions: TBD

## Agent Inspectability and Explainability

- What must be explicit and deterministic for agents: TBD
- What must be attributable, evidenced, or governed: TBD

## Non-goals

- [ ] TBD

## Backlog Context

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
