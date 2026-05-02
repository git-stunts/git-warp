# 0107 v17 Reality Check

- Status: `hill met`
- Release lane: `v17.0.0`
- Design role: release boundary decision
- Review audience: maintainers and future agents

## Hill

Define what v17 actually requires to ship and what explicitly remains
known debt.

Crisp TypeScript is a tool. Trustworthy v17 is the target.

## Boundary

This is a doc-only reality check, not a sludge survey and not an
implementation cycle.

This cycle does not pull another seam, start RED, start GREEN, resume
0096, add the hook, edit production code, create backlog cards, or push.

The release scoreboard is:

```txt
What blocks shipping a trustworthy v17?
```

The scoreboard is not issue count, bad-code card count, or Graft
candidate signal count.

## v17 Ships If

- Core typecheck passes.
- Consumer typecheck passes.
- Snapshot public API is honest.
- Query read seam is no longer `RuntimeHost`-shaped.
- Comparison coordinate-backed side seam is no longer host-bag-shaped.
- Release/API notes explain breaking public API changes.
- Known remaining sludge is documented and scoped as post-v17 debt.

## v17 Explicitly Does Not Require

- Fixing every `RuntimeHost` seam.
- Resolving all 0096 cast families.
- Removing every historical `unknown`.
- Splitting every god file.
- Making all tests beautiful.
- Eliminating every Graft candidate signal.
- Closing every v17 `release_home` bad-code card.

## Current Evidence

Recent cycle evidence:

- 0102 is hill met for the snapshot PropValue API model.
- 0103 is hill met for the consumer public API typecheck gate.
- 0104 is hill met for the sludge screening map.
- 0105 is hill met for the QueryRunner read-model seam.
- 0106 is hill met for the coordinate-backed comparison side seam.

Validation rerun during this reality check:

```sh
npm run typecheck
npm run typecheck:consumer
npm run lint:sludge
npx vitest run test/conformance/comparisonLiveCoordinateSeam.test.ts test/unit/domain/services/controllers/ComparisonController.test.ts
```

Results:

- `npm run typecheck` passed.
- `npm run typecheck:consumer` passed.
- `npm run lint:sludge` passed.
- Focused 0106 comparison seam tests passed: `2` files, `69` tests.

## Actual Blockers

v17 is not cleared to tag yet.

Concrete blockers before release/tag:

1. Large-graph bounded-residency validation found a real blocker, and
   v17's release claim is narrowed.
   The concrete fixture at `/Users/james/.think/codex` can be opened and
   queried on this machine, but graph-level `graph.query()` still opens
   a state-backed read model by forcing `_ensureFreshState()` and
   `_materializeGraph()`. 0110 proved the default query-provider path
   cannot honestly be made GREEN with the current live sources: the
   fixture's index-tree checkpoint is stale relative to the live writer
   ref, and no live-tail bounded query/checksum source exists. v17
   will not claim the v16 full-buffering blocker is fixed. v17 may claim
   TypeScript migration, public API honesty, and streaming/bounded-query
   groundwork only. Live-tail bounded query/checksum substrate is
   post-v17 scope.
2. Release/API notes are not confirmed complete.
   Public-facing changes from the recent workstream must be explained,
   including snapshot public return/input types and any intentional direct
   constructor corrections for exported query objects.
3. Full release validation has not been run after the 0102 through 0106
   sequence.
   The release runbook requires `npm run release:preflight` before
   tagging.

These are release-confidence blockers. They are not a mandate to pull
another deslugging seam.

## Known Debt After v17

Known post-v17 debt unless a release validation gate proves otherwise:

- Remaining `RuntimeHost` seams mapped by 0104.
- Full strand overlay comparison materialization.
- Transfer planning host dependencies.
- Helper ownership in `ComparisonSelector.ts`.
- Frontier projection ownership.
- Remaining 0096 cast-family work.
- Test scaffolding that is ugly but not currently blocking trust.
- Graft candidate signals not attached to a failing test, blocked
  feature, public API lie, runtime correctness risk, or repeated pain
  point.
- Pre-commit sludge hook tooling.

## Cleanup Admission Rule

No new cleanup work should enter v17 unless it is attached to one of:

1. A failing test.
2. A blocked feature.
3. A public API lie.
4. A runtime correctness risk.
5. A repeated pain point that blocked at least two cycles.

If cleanup does not meet one of those gates, it stays documented debt
instead of becoming release scope.

## Decision

v17 has two concrete blockers before release/tag:

1. Complete release/API notes, including the narrowed large-graph claim.
2. Run full release validation, including `npm run release:preflight`.

v17 should proceed toward release validation, not another general
deslugging cycle. If release validation reveals a specific blocker, fix
that blocker. Otherwise, remaining structural sludge is known post-v17
debt.

Release claim decision:

- v17 ships TypeScript migration and streaming/bounded-query groundwork.
- v17 does not claim live large-graph `graph.query()` bounded residency.
- The live-tail bounded query/checksum substrate moves to post-v17 work.

## SLUDGE STRIKER SUMMARY

### 1. Sludge Encountered

- Pattern: cleanup-as-product risk.
  Files: cycle process, v17 planning.
  Why it is sludge: deslugging work can become a self-sustaining process
  that prevents release movement.
  Status: rejected by this boundary decision.
- Pattern: false scoreboard risk.
  Files: backlog and Graft telemetry.
  Why it is sludge: issue counts, bad-code counts, and scanner signal
  counts can become proxy goals instead of release-confidence evidence.
  Status: rejected as the v17 scoreboard.

### 2. Sludge Fixed

- Replaced broad "keep deslugging" momentum with a release boundary:
  what blocks a trustworthy v17.
- Replaced raw backlog/scanner counts as release scoreboards with
  concrete release-confidence blockers.
- Replaced implicit cleanup admission with explicit admission rules.

### 3. Sludge Rejected

- Rejected another automatic RuntimeHost seam.
- Rejected another sludge survey.
- Rejected 0096 by reflex.
- Rejected hook work before release boundary work.
- Rejected treating all known sludge as release-blocking.

### 4. Sludge Deferred / Tracked

- RuntimeHost seams remain post-v17 debt unless validation proves a
  release blocker.
- Full strand overlay comparison remains post-v17 debt unless validation
  proves a release blocker.
- Transfer planning host dependencies remain post-v17 debt unless
  validation proves a release blocker.
- 0096 remains post-v17 debt unless a concrete gate requires it.

### 5. Anti-Sludge Checks Actually Run

- `npm run typecheck` passed.
- `npm run typecheck:consumer` passed.
- `npm run lint:sludge` passed.
- `npx vitest run test/conformance/comparisonLiveCoordinateSeam.test.ts
  test/unit/domain/services/controllers/ComparisonController.test.ts`
  passed.

### 6. Remaining Risk

Remaining risk: v17 is not release-ready until release/API notes, full
release validation, and branch safety are complete. The risk is no longer
unbounded structural cleanup; it is failing to keep the release boundary
small and evidence-based.
