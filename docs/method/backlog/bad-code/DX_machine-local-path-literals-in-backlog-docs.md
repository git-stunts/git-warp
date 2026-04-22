---
blocked_by: []
blocks: []
id: DX_machine-local-path-literals-in-backlog-docs
---

# Machine-local path literals in backlog docs

## Why

Some backlog docs still contain machine-local absolute paths.

That is bad repo hygiene for a few reasons:

- it leaks one maintainer's workstation layout into repo truth
- it makes examples and evidence non-portable
- it trains future notes to treat private local paths as normal documentation

This is not a theoretical issue. The current backlog still contains concrete
examples of machine-local absolute paths in docs under `docs/method/backlog/`.

## What it should look like

- backlog docs use repo-relative paths where possible
- workstation-specific absolute paths are removed from active backlog notes
- when a local path truly matters as captured evidence, it is rewritten or
  abstracted so it does not disclose private local layout unnecessarily

## Done looks like

- active backlog notes no longer contain machine-local absolute paths
- the affected notes are rewritten to portable repo-relative examples
- the repo stops reintroducing this leak pattern in new backlog notes

## Starting points

- `docs/method/backlog/inbox/DX_method-mcp-workspace-detection-drift.md`
- `docs/method/backlog/v20.0.0/PROTO_strand-collapse-optic-for-causal-slicing.md`
