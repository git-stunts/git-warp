---
title: TickPatch TickReceipt witness ladder audit
rank: 1
lane: up-next
cluster: continuum-witness
impact: high
effort: medium
confidence: high
---

# TickPatch TickReceipt witness ladder audit

The Continuum witness packets gave us a cleaner ladder:

- `R_core` = seam-carrying reintegration core
- `W_core` = purpose-minimal local witness core
- `ReceiptRecord` = witness core plus explanatory shell

`git-warp` already has strong replay/runtime nouns in `TickPatch` and
`TickReceipt`, but it is still too easy to talk about them as if they were one
undifferentiated witness blob.

Work:

- identify what in `TickPatch` is true replay core versus broader witness shell
- identify what in `TickReceipt` is receipt shell versus law-bearing core
- name which fields are substrate-owned and which are debugger/runtime
  projection
- record whether reintegration-bearing structure exists explicitly today or is
  only implicit in broader receipts
- leave behind one clear mapping that Wesley and `warp-ttd` can target without
  reinterpreting `git-warp` from the outside

Why this matters:

- keeps substrate truth separate from debugger explanation
- gives Wesley a cleaner contract boundary
- gives `warp-ttd` a better host mapping for neighborhood core and receipt shell

## Source

- `docs/design/causal-lifting-and-merge-conflicts.tex`
- Continuum `0010` through `0013`
