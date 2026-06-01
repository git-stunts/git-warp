---
id: INFRA_extract-warp-orset-package-post-publish
blocked_by:
  - INFRA_multipackage-publish-pipeline
blocks:
  - INFRA_extract-warp-kernel-package-post-publish
feature: trie-state-storage
---

# Extract warp-orset as a real published workspace package

## Problem

`packages/warp-orset/` exists, but it is still a private workspace shell.
The real ORSet implementation remains in root under `src/domain/crdt/` and
`src/domain/orset/`.

Cycle 0020 was closed as not-met because extracting a private workspace package
into shipped root imports would break consumers. That is still the right
constraint.

## Fix

After the multi-package publish pipeline exists, move ORSet-owned code from
root into `packages/warp-orset/src/`, flip the package public, and make root
declare and consume `@git-stunts/warp-orset` as a normal dependency.

## Acceptance

- `packages/warp-orset/package.json` is public and participates in the
  lock-step release pipeline.
- ORSet-owned root code moves into `packages/warp-orset/src/`.
- Root imports use the published package boundary instead of relative imports
  into `packages/warp-orset/`.
- `src/domain/orset/README.md` is updated to reflect the code that moved and
  any root-local ORSet code that remains.
- Browser, JSR, TypeScript, lint, coverage, and consumer checks all exercise
  the package boundary.

## Source

Rehomed from archived v17 residual note
`INFRA_extract-warp-orset-package-post-publish`.
