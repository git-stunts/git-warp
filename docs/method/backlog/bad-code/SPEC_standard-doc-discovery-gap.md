---
id: SPEC_standard-doc-discovery-gap
blocked_by: []
blocks: []
feature: docs-dx
release_home: v17.0.0
---

# Standard repository docs exist only under `.github/`

**Effort:** S

## What's Wrong

The repo has `.github/CONTRIBUTING.md`, `.github/SECURITY.md`, and
`.github/CODE_OF_CONDUCT.md`, but root-level files are absent and the
README does not clearly link to them.

That is a discoverability gap for a published package. Registry users
and casual contributors often look for standard docs at the root.

## Suggested Fix

Either add short root pointer files for `CONTRIBUTING.md`,
`SECURITY.md`, and `CODE_OF_CONDUCT.md`, or add explicit README links
to the `.github/` files. Keep a docs lint/link check proving those
entry points remain reachable.
