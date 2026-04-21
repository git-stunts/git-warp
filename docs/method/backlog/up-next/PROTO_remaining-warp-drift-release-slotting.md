---
title: Remaining WARP drift release slotting
rank: 2
lane: up-next
cluster: doctrine-horizon
impact: high
effort: medium
confidence: medium
---

# Remaining WARP drift release slotting

Cycle 0035 clarified the read-side noun model and promoted the observer/runtime
ladder into real `v19.0.0` work. That still leaves the rest of the current
drift ledger to sort cleanly across later majors.

The unresolved drift is not one blob. It mixes at least:

- observer/read runtime drift
- strand semantics drift
- braid/common-basis drift
- witnessed admission shell drift
- release-horizon uncertainty about what belongs in `v19`, `v20`, and `v21`

The next design pass should make that split explicit.

Work:

- re-read `docs/audits/WARP_DRIFT.md` against:
  - `docs/GLOSSARY.md`
  - `docs/design/0035-observer-geometry-architecture-ladder.md`
  - `docs/design/release-horizon-v20-v21.md`
- separate which remaining drift items are:
  - direct `v19` doctrine/runtime work
  - prerequisites for `v20` slice-first execution
  - better deferred to `v21` distributed/plural admission work
- name any missing backlog items required to close the gap honestly
- update the release-horizon story if the audit shows that `v20`/`v21` need a
  cleaner thematic split

Why this matters:

- prevents `v19`, `v20`, and `v21` from becoming mushy “future parity” buckets
- keeps strand and admission work from getting accidentally mixed into the
  wrong major
- gives the repo one explicit answer to “what drift remains after the current
  observer/read-side ladder?”

## Source

- `docs/audits/WARP_DRIFT.md`
- `docs/GLOSSARY.md`
- `docs/design/0035-observer-geometry-architecture-ladder.md`
- `docs/design/release-horizon-v20-v21.md`
- `docs/method/backlog/v19.0.0/README.md`
