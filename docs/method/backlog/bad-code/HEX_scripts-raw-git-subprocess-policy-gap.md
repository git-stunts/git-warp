---
id: HEX_scripts-raw-git-subprocess-policy-gap
blocked_by: []
blocks: []
---

# Repo maintenance scripts still shell out to raw git instead of plumbing

**Effort:** M

## What's Wrong

Several maintenance scripts still call `git` directly via `execSync`
or `execFileSync`. If the rule is truly repo-wide for anything that
touches Git, these scripts remain outside the required
`@git-stunts/plumbing` boundary.

## Why It Matters

Even if these are not runtime storage paths, they still create a
second Git execution model with different error handling and typing. If
the rule is repo-wide, the scripts need the same normalization as
product code. If it is not repo-wide, the carve-out should be explicit.

## Evidence

- `scripts/quarantine-graduate-check.ts:124`
- `scripts/setup-hooks.ts:17`
- `scripts/setup-hooks.ts:32`
- `scripts/ratchet-delta.ts:46`
- `scripts/migrations/v17.0.0/clear-legacy-caches.ts:33`

## Suggested Fix

1. Decide whether the Git-boundary rule applies to all scripts or only
   runtime and product code.
2. If repo-wide, route script-side Git access through
   `@git-stunts/plumbing`.
3. If not repo-wide, document the carve-out explicitly so the policy
   is not ambiguous.
