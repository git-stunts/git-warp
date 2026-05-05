---
id: PORT_hookinstaller-ad-hoc-git-config-callback
blocked_by: []
blocks: []
feature: api-capabilities
release_home: v17.0.0
---

# HookInstaller uses an ad hoc git config callback instead of a typed port

**Effort:** S

## What's Wrong

`HookInstaller` accepts `_execGitConfig: (repoPath, key) => string |
null` instead of depending on a typed port. The service is forced to
reason through a stringly callback instead of an explicit capability
boundary.

## Why It Matters

This obscures the real dependency, weakens typing, and made it easy
for the CLI to wire in raw `git` subprocesses. The domain service
should depend on a stable port, not a shell-shaped callback.

## Evidence

- `src/domain/services/HookInstaller.ts:98`
- `src/domain/services/HookInstaller.ts:114`
- `src/domain/services/HookInstaller.ts:289`
- `src/domain/services/HookInstaller.ts:295`

## Suggested Fix

1. Replace `_execGitConfig` with a focused typed port for the Git
   config and git-dir data the installer needs.
2. Back that port with `@git-stunts/plumbing` in the adapter or
   composition layer.
3. Keep `HookInstaller` responsible only for policy and filesystem
   installation behavior.
