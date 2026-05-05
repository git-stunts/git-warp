# Retro — 0052 Dead-Code Cleanup

## Outcome

`not met`

The original hill was wrong. The code named by
`SLUDGE_dead-code-cleanup` is still live.

`conflictTargetIdentity.ts` still imports `OP_STRATEGIES` from
`JoinReducer.ts`, so the strategy registry and adjacent op-shape files are not a
free deletions slice.

## What changed

- removed the duplicate live sludge card from `v17`
- updated the release ledger so it records the cycle as `not met`
- strengthened `PROTO_purge-fake-models` so it explicitly owns the
  `ConflictCandidateCollector` / conflict-target dispatch residue
- added a docs ratchet to keep that ownership explicit

## Why this is better

It removes a duplicate planning lie.

The repo no longer carries one note saying "delete dead code" while another
note already owns the real op-model / strategy-collapse work that keeps those
files alive.

## Next

When `PROTO_purge-fake-models` moves the conflict-analysis path onto real
op-class dispatch, the strategy registry and adjacent `*Like` residue can die
for real.
