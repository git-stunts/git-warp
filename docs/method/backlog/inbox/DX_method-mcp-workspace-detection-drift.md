---
id: DX_method-mcp-workspace-detection-drift
blocks: []
blocked_by: []
---

# METHOD MCP workspace detection drift

## Problem

The METHOD MCP surface disagrees with itself about whether this repo is
a METHOD workspace.

On the same path, `method_doctor` recognizes the repo root and returns
actionable diagnostics, while `method_status` and
`method_backlog_dependencies` reject the workspace outright with
`Run method init first`.

That means the read-only commands most useful for planning and backlog
analysis become unavailable exactly when the doctor is already telling
us what is wrong.

## Reproduction

Workspace:

- `/Users/james/git/git-stunts/git-warp`

Date:

- `2026-04-19`

Calls:

1. `method_doctor(workspace="/Users/james/git/git-stunts/git-warp")`
2. `method_status(workspace="/Users/james/git/git-stunts/git-warp", summary=true)`
3. `method_backlog_dependencies(workspace="/Users/james/git/git-stunts/git-warp", readyOnly=true)`

## Observed

`method_doctor` succeeds and reports the workspace root correctly:

- `ok: true`
- `root: /Users/james/git/git-stunts/git-warp`
- `status: error`
- `counts.errors: 397`
- `counts.warnings: 66`

It then returns detailed structural, frontmatter, git-hooks, and backlog
findings, including missing METHOD files and missing frontmatter on many
packets.

`method_status` rejects the same path:

- `ok: false`
- `error.message: "/Users/james/git/git-stunts/git-warp is not a METHOD workspace. Run method init first."`

`method_backlog_dependencies` rejects the same path with the same
message:

- `ok: false`
- `error.message: "/Users/james/git/git-stunts/git-warp is not a METHOD workspace. Run method init first."`

## Expected

All three commands should agree on workspace recognition.

Acceptable outcomes:

- They all accept the workspace and operate in degraded mode when the
  repo is METHOD-shaped but nonconformant.
- They all reject the workspace for the same reason with the same
  detection rules.

Preferred outcome:

- `method_status` and `method_backlog_dependencies` should behave like
  `method_doctor`: recognize the repo, report that it is degraded, and
  still provide bounded read-only answers.

## Why It Matters

- It blocks backlog planning on repos that need planning the most.
- It forces fallback parsing of `docs/method/backlog/**/*.md` even
  though METHOD already has a dependency command.
- It creates false negatives for agents and humans trying to use METHOD
  as a coordination surface.

## Likely Fault Line

`method_doctor` appears to use a more permissive workspace recognizer
than `method_status` and `method_backlog_dependencies`.

The commands likely disagree about whether missing modern scaffold files
such as `docs/PROCESS.md`, `docs/RELEASE.md`, `docs/method/releases/`,
or missing frontmatter should disqualify the repo entirely, instead of
marking it as degraded.

## Acceptance Criteria

- `method_doctor`, `method_status`, and `method_backlog_dependencies`
  agree on whether a repo is a METHOD workspace.
- A degraded-but-recognized workspace can still use read-only commands.
- If a repo is truly rejected, every command returns the same rejection
  reason.
- Workspace detection rules are documented in one place instead of
  drifting across commands.
