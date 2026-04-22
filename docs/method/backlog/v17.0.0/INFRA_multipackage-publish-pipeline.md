---
id: INFRA_multipackage-publish-pipeline
blocked_by:
  - TS_publish-pipeline
blocks:
  - INFRA_extract-warp-orset-package-post-publish
feature: tooling-release
---

# Design and implement the multi-package release pipeline

## Problem

Current release/preflight/tag-guard/verify workflows are rooted in the
single top-level `@git-stunts/git-warp` package. Shadow-Trie ORSet
(Design 0018) calls for extracting `warp-orset`, `warp-kernel`, and
`warp-adapters` as their own npm packages published alongside the
root package.

Before any workspace package can be flipped public and consumed by
root in shipped code, the release pipeline must support publishing
multiple packages in lock step.

## Fix

Design and implement the multi-package release story:

**Release model (non-cursed):**
- ONE repo tag per release.
- All package `version` fields must equal that tag version.
- Release workflow publishes root + every public workspace package
  from that single tag.
- Lock-step versioning enforced by the verify script across ALL
  `package.json` files.
- NO per-package tag formats.

**Work items:**
- `release.yml` — publish root + public workspace packages from one
  tag. OIDC trusted publishing for each package.
- `release-pr.yml` — preflight all packages: `npm pack --dry-run`
  per package, JSR dry-run per package where applicable.
- `verify` script — lock-step version check across root and every
  workspace package.
- `tag-guard.yml` — continues to validate ONE repo tag format. Do
  NOT invent per-package tags.
- `jsr.json` — research JSR workspace support. If JSR supports
  workspaces natively, use that. Otherwise publish each package's
  `jsr.json` separately from the same tag.
- Release runbook (`docs/method/release.md`) — document the
  multi-package flow.

## Scope

**In:**
- All release workflow changes listed above.
- Version-lock enforcement.
- Runbook documentation.

**Out:**
- Flipping any specific workspace package public (that's each
  extraction item's job, e.g.
  `INFRA_extract-warp-orset-package-post-publish`).
- Changing the workspace scaffold shape (0019 is intact).

## Existing v17 links

- `TS_publish-pipeline` — the existing v17 publish pipeline item.
  This multi-package work is the natural extension. The two items
  may merge during their cycle; for now, this one is `blocked_by`
  that one to avoid two parallel release storylines.

## Notes

- Keep the one-repo-tag / one-version / all-packages-at-that-version
  model. Per-package tag formats are a self-inflicted injury.
- JSR workspace support is the research item most likely to surprise
  the slice.
