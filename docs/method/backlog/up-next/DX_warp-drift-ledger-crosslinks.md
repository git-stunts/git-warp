---
title: WARP drift ledger crosslinks
rank: 1
lane: up-next
cluster: doctrine-hygiene
impact: medium
effort: small
confidence: high
---

# WARP drift ledger crosslinks

The current drift audit should explicitly point at the new canonical noun and
runtime-ladder artifacts:

- `docs/GLOSSARY.md`
- `docs/design/0035-observer-geometry-architecture-ladder.md`
- `docs/design/release-horizon-v20-v21.md`

Right now the audit still captures the doctrinal problem correctly, but it does
not yet send readers to the new wall-chart and release horizon.

Work:

- update `docs/audits/WARP_DRIFT.md` to reference the glossary and the
  architecture ladder in its design-context section
- add the release horizon note where helpful so readers can see how the
  unresolved drift maps into later majors
- keep the audit as the ledger, but make the new glossary/ladder the canonical
  explanatory surfaces

Why this matters:

- newcomers reading the audit should land on the canonical noun source of truth
- the drift ledger should now point to the actual implementation ladder, not
  just the problem statement
- it keeps the repo from splitting drift diagnosis and runtime planning into two
  disconnected doc islands

## Source

- `docs/audits/WARP_DRIFT.md`
- `docs/GLOSSARY.md`
- `docs/design/0035-observer-geometry-architecture-ladder.md`
- `docs/design/release-horizon-v20-v21.md`
