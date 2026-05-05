---
title: "Create packages/warp-orset and move reusable ORSet primitives"
legend: "INFRA"
cycle: "0020-extract-warp-orset-package"
source_backlog: "docs/method/backlog/v17.0.0/INFRA_extract-warp-orset-package.md"
---

# Create packages/warp-orset and move reusable ORSet primitives

Source backlog item: `docs/method/backlog/v17.0.0/INFRA_extract-warp-orset-package.md`
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

The ORSet, Dot, and VersionVector implementations live in
`src/domain/crdt/`. The Shadow-Trie ORSet engine needs its own package
boundary so trie internals do not leak into the kernel or product
packages.

## Fix

Move `src/domain/crdt/{ORSet,Dot,VersionVector}.ts` and supporting
types into `packages/warp-orset/src/`. Update all import paths in
the main package to use the workspace dependency. Verify all tests
pass with the new package boundary.

## Scope

**In:** Mechanical move of CRDT primitives. Import rewrites. Test
verification.

**Out:** LWWRegister stays in kernel space for now. No behavior changes.
No new APIs.

## Notes

- Only warp-orset is extracted early. warp-kernel and warp-adapters
  extract later, after the ORSet line proves its seams.
- LWW is explicitly excluded from the first cut.
