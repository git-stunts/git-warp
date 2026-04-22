---
id: DX_tsc-autofix-tool
blocked_by: []
blocks: []
---

# Mechanical tsc autofix tool

The TS4111 fixer script from the TSC zero campaign generalized well.
A `tsc-autofix` CLI that reads `tsc --noEmit` stderr, classifies
errors by fixability, and applies mechanical fixes:

- TS4111 (bracket access): `.prop` -> `['prop']`
- TS6133 (unused vars/imports): delete the declaration
- TS2464 (computed property): wrap in cast
- TS2532/TS18048 (possibly undefined): suggest `?? defaultValue`

Non-mechanical errors (TS2345, TS2322) left as report. Could live in
`scripts/` or become a `@git-stunts` tool.
