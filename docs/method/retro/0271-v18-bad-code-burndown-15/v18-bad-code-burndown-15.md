# V18 Bad-Code Burndown 15 Drift Check

Date: 2026-06-09
Branch: `bad-code-v18-burndown-15`
Scope: first 15 open `release-home:v18.0.0` + `lane:bad-code`
issues selected for a bounded burn-down pass.

## Summary

This pass cleared 10 of 15 selected slices from an implementation-readiness
perspective:

- 8 issues were fixed by this branch.
- 2 issues were verified as stale/resolved by current `main`.
- 5 issues remain carried because they need broader design or implementation
  work than this drift-check slice can honestly claim.

No release was tagged.

## Slice Status

| Issue | Status | Evidence |
| --- | --- | --- |
| #153 Path-keyed object accumulators at Git boundaries | Carried | Broad Git-boundary audit still needed. This branch did not eliminate all path-keyed accumulator risks. |
| #160 Reducer silently no-ops unknown op types | Fixed on branch | `JoinReducer` now fails closed with `PatchError` `E_PATCH_UNKNOWN_OP`; receipt and validation tests assert the failure path. |
| #162 `WarpState.prop` carries `LWWRegister<unknown>` | Stale/resolved on main | `src/domain/services/state/WarpState.ts` now uses `LWWRegister<PropValue>` for `prop` and property accessors. |
| #195 NeighborEdge and Direction typedef-only concepts | Fixed on branch | `NeighborEdge` is a runtime class, `isDirection` is a boundary guard, and port tests cover validation and immutability. |
| #197 PatchDiff validation and typedef-only entries | Fixed on branch | `EdgeDiffEntry`, `PropDiffEntry`, and `PatchDiff` now validate and freeze constructor inputs. |
| #198 Patch constructor validation | Fixed on branch | `Patch` now validates schema, writer, Lamport, context, ops, reads, and writes, while preserving existing CBOR wire bytes for plain context records. |
| #199 `removeNode`/`removeEdge` nonexistent no-op | Fixed on branch | `PatchBuilder` now throws `PatchError` `E_PATCH_ENTITY_NOT_FOUND` when remove targets have no observed dots. |
| #204 StateDiffResult typedef-only concept | Fixed on branch | `StateDiffResult` is now a runtime class with frozen node, edge, and prop diff containers. |
| #229 PatchBuilderV2 12-parameter constructor | Stale/resolved on main | `PatchBuilder` currently takes a single `PatchBuilderOptions` object; `PatchBuilderV2` is absent. |
| #230 PatchBuilder churn risk | Carried | `src/domain/services/PatchBuilder.ts` is still 535 lines and remains above the 500-line policy threshold. |
| #253 Guard BTR wire DTO locality | Fixed on branch | Added a deterministic locality guard test rejecting provenance protocol terms from BTR wire DTO files. |
| #280 StateDiff private helper residue | Carried | Runtime result modeling improved, but helper residue remains a separate cleanup. |
| #380 Deno runtime smoke tests disable timer sanitizers | Fixed on branch | Deno import map repaired and runtime tests pass with default sanitizer settings. |
| #384 Live-tail bounded query/checksum substrate missing | Carried | This requires new substrate work; no live-tail checksum implementation landed in this pass. |
| #576 First-use docs caveated because normal reads lack bounded providers | Carried | Docs still need to be tightened after bounded provider substrate work lands. |

## Validation

Commands run:

```text
npm run lint
npm run lint:md
npm run typecheck
npm run test:local
deno test --config test/runtime/deno/deno.json --allow-all test/runtime/deno
```

Observed results:

```text
npm run lint: passed
npm run lint:md: passed
npm run typecheck: passed
npm run test:local: 553 files passed, 7188 tests passed
deno runtime tests: 18 passed, 0 failed
```

## Drift Notes

- Do not close the fixed GitHub issues until this branch is reviewed and
  merged, or until the maintainer explicitly accepts closing against this
  branch.
- #162 and #229 can be closed as stale/resolved after issue evidence is posted.
- #153, #230, #280, #384, and #576 remain the next bad-code burn-down queue.
- #230 should be tackled before any v18 release decision because the touched
  `PatchBuilder` file still exceeds the project file-size policy.
