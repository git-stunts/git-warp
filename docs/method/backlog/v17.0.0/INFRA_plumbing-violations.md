---
id: INFRA_plumbing-violations
blocks: []
blocked_by: []
feature: runtime-boundaries
---

# Fix raw git command violations

## Problem

Three locations use raw `execFileSync('git', ...)` or
`execSync('git ...')` instead of `@git-stunts/plumbing`:

1. `bin/cli/shared.js:228,232` — `execGitConfigValue()` reads git
   config with `execFileSync('git', ['config', ...])`
2. `scripts/setup-hooks.js:17` — `execSync('git rev-parse --show-toplevel')`
3. `scripts/setup-hooks.js:32` — `execSync('git config core.hooksPath ...')`

## Fix

Pass a plumbing instance to CLI infrastructure, or create a lightweight
git-config utility backed by plumbing. For `setup-hooks.js`, either
import plumbing or accept the violation (it's a one-time setup script).
