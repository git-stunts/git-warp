# V18 Bad-Code Burndown 15 Drift Check

Date: 2026-06-09
Branch: `bad-code-v18-burndown-15`
Scope: first 15 open `release-home:v18.0.0` + `lane:bad-code`
issues selected for a bounded burn-down pass.

## Summary

This pass cleared 15 of 15 selected slices from an implementation-readiness
perspective:

- 13 issues were fixed by this branch.
- 2 issues were verified as stale/resolved by current `main`.

No release was tagged.

## Slice Status

| Issue | Status | Evidence |
| --- | --- | --- |
| #153 Path-keyed object accumulators at Git boundaries | Fixed on branch | Git/tree boundary accumulators now assemble path-keyed outputs through `Map` before materialization; deterministic tests cover `__proto__` and `constructor` paths. |
| #160 Reducer silently no-ops unknown op types | Fixed on branch | `JoinReducer` now fails closed with `PatchError` `E_PATCH_UNKNOWN_OP`; receipt and validation tests assert the failure path. |
| #162 `WarpState.prop` carries `LWWRegister<unknown>` | Stale/resolved on main | `src/domain/services/state/WarpState.ts` now uses `LWWRegister<PropValue>` for `prop` and property accessors. |
| #195 NeighborEdge and Direction typedef-only concepts | Fixed on branch | `NeighborEdge` is a runtime class, `isDirection` is a boundary guard, and port tests cover validation and immutability. |
| #197 PatchDiff validation and typedef-only entries | Fixed on branch | `EdgeDiffEntry`, `PropDiffEntry`, and `PatchDiff` now validate and freeze constructor inputs. |
| #198 Patch constructor validation | Fixed on branch | `Patch` now validates schema, writer, Lamport, context, ops, reads, and writes, while preserving existing CBOR wire bytes for plain context records. |
| #199 `removeNode`/`removeEdge` nonexistent no-op | Fixed on branch | `PatchBuilder` now throws `PatchError` `E_PATCH_ENTITY_NOT_FOUND` when remove targets have no observed dots. |
| #204 StateDiffResult typedef-only concept | Fixed on branch | `StateDiffResult` is now a runtime class with frozen node, edge, and prop diff containers. |
| #229 PatchBuilderV2 12-parameter constructor | Stale/resolved on main | `PatchBuilder` currently takes a single `PatchBuilderOptions` object; `PatchBuilderV2` is absent. |
| #230 PatchBuilder churn risk | Fixed on branch | Patch content storage helpers moved into `PatchBuilderContent`; `src/domain/services/PatchBuilder.ts` is now 463 lines, under the 500-line policy threshold. |
| #253 Guard BTR wire DTO locality | Fixed on branch | Added a deterministic locality guard test rejecting provenance protocol terms from BTR wire DTO files. |
| #280 StateDiff private helper residue | Fixed on branch | Ordering and deep-value equality helpers moved into testable utility modules with direct edge-case coverage; unreachable update residue was removed from `StateDiff`. |
| #380 Deno runtime smoke tests disable timer sanitizers | Fixed on branch | Deno import map repaired and runtime tests pass with default sanitizer settings. |
| #384 Live-tail bounded query/checksum substrate missing | Fixed on branch | Exact id-only `graph.query().match(id).select(['id']).run()` now uses checkpoint-tail exact-read evidence and reports a checkpoint-tail read identity without `_ensureFreshState()`. |
| #576 First-use docs caveated because normal reads lack bounded providers | Fixed on branch | First-use docs now teach exact id-only query as the bounded read shape and keep broader property, wildcard, traversal, and observer paths explicitly transitional. |

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
npm run test:local: 558 files passed, 7199 tests passed
deno runtime tests: 18 passed, 0 failed
```

## Drift Notes

- Do not close the fixed GitHub issues until this branch is reviewed and
  merged, or until the maintainer explicitly accepts closing against this
  branch.
- #162 and #229 can be closed as stale/resolved after issue evidence is posted.
- The selected 15-issue bad-code tranche is implementation-ready on this branch.
