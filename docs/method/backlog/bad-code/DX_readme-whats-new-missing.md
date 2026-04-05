# README missing "What's New" section that release runbook mandates

**Effort:** XS

CLAUDE.md release runbook says: "Update README.md — edit the
## What's New in vX.Y.Z section." CI supposedly enforces this.
But the README has no such section.

Either:
1. The runbook is aspirational and CI doesn't actually check, or
2. The section was removed and the runbook wasn't updated

## Suggested fix

Pick one:
- Add a "What's New in v16" section to README.md, or
- Remove the mandate from the release runbook and CI config
