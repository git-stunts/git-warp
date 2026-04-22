---
id: HEX_cli-hook-installer-raw-git-bypass
blocked_by: []
blocks: []
feature: sync-trust-security
release_home: v17.0.0
---

# CLI hook installer bypasses ports with raw git subprocesses

**Effort:** S

## What's Wrong

`bin/cli/shared.ts` reads `--git-dir` and `core.hooksPath` by calling
`execFileSync('git', ...)` directly in `execGitConfigValue()`. That
bypasses both the hexagonal port boundary and the repo-standard
`@git-stunts/plumbing` layer.

## Why It Matters

This is a runtime CLI path, not a throwaway script. It creates a
second Git access path outside the adapter layer, so behavior, typing,
and error handling can drift from the main plumbing-backed persistence
surface.

## Evidence

- `bin/cli/shared.ts:184`
- `bin/cli/shared.ts:187`
- `bin/cli/shared.ts:191`

## Suggested Fix

1. Remove direct `git` subprocess calls from `bin/cli/shared.ts`.
2. Resolve hook-related Git config through a real port-backed adapter.
3. Use `@git-stunts/plumbing` for the Git config and git-dir reads.
4. Keep hook file writes behind the filesystem boundary only.
