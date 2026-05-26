# 0146 Bearing V18 Completed Rotation Retro

## Outcome

`docs/BEARING.md` was reduced from a completed-slice ledger back into a live
repo signpost. Completed v18 implementation, release-prep, and post-merge
planning history through slice 112 now lives in the design docs, changelog,
backlog lane summaries, PR history, and this rotation note instead of staying
inline in BEARING.

## What Moved Out

The following completed material was summarized out of BEARING:

- historical PR summaries for v18 PRs #94 through #108;
- per-slice completion prose for slices 36 through 65;
- the completed slice 66 through 112 checklist blocks;
- slice 82 evidence detail;
- completed v18 release-prep user stories, acceptance criteria, and test plans;
- the full completed running task list for slices 1 through 112.

The detailed evidence remains inspectable:

- slice design docs live under `docs/design/`;
- release-candidate and release-prep evidence lives in
  `docs/method/backlog/v18.0.0/README.md` and
  `docs/method/backlog/v18.0.0/RELEASE_v18-public-release-blockers.md`;
- release-facing user-visible changes live in `CHANGELOG.md`;
- merged branch history lives in PRs #94 through #108 and their merge commits.

## Rotated History Summary

V18 completed the graph-model convergence runway:

- runtime-backed node and edge records;
- generic attachment records;
- typed content payloads and projection-backed public content reads/writes;
- runtime-backed legacy property projection nouns;
- projection-backed public query and state-reader property views;
- typed property write intents;
- typed graph-op algebra projection.

V18 completed the migration and proof runway:

- migration manifest and source inventory nouns;
- dry-run migration planning;
- ordered migration history input;
- manifest JSON boundary serialization;
- non-destructive dry-run CLI;
- genesis equivalence nouns, fixtures, and divergence reports;
- v17 golden graph-history fixture restoration;
- real source inventory collection from restored writer refs;
- operation lowering;
- scratch migration writing;
- scratch equivalence gating;
- archive-preserving guarded finalization;
- command-level migration wiring and deterministic operator reports.

V18 completed the wet-run and release-candidate runway:

- production-runtime scratch replay conformance;
- restored-v17 and scratch public-read reading construction;
- fixture wet-run harnessing;
- drift checks;
- zero-mismatch public-read equivalence for the canonical v17 fixture;
- guarded finalization JSON confirmation;
- stale-live-ref and archive-collision coverage;
- generated Continuum runtime-boundary fixture ingestion;
- graph-model contract conformance;
- `warp-ttd` generated-family smoke evidence;
- one retired raw content/property boundary and closeout-audit ratchet;
- release-candidate evidence and release-prep metadata for `18.0.0`.

V18 post-merge planning completed slices 103 through 112:

- post-merge release handoff;
- tag and publish gate;
- release evidence archive design;
- post-v18 storage retirement decision frame;
- v19 native Continuum witnesshood runway;
- v20 graph streaming scope;
- public-doc honesty audit;
- next residual boundary retirement decision;
- backlog lane cleanup plan;
- next-goalpost replan after release-prep merge.

## Current Live State After Rotation

At the rotation point after PR #108 merged, `main` pointed at `59beefed`.
`package.json` and `jsr.json` both said `18.0.0`, and release preflight had
passed from aligned `main` at that commit. The public release was still not
complete because no `v18.0.0` tag, npm publish evidence, or JSR publish
evidence had been recorded yet.

## Follow-Up

Keep BEARING short. When a checklist is fully complete, move the durable
evidence into a design doc, retro, release note, or backlog lane summary, then
leave BEARING with only current state, unresolved tensions, and next actions.

## Battle Report

The signpost had turned into a filing cabinet. The filings are still there,
but the signpost is readable again. The next mess is simple and sharp: publish
v18, then pick the next branch by mode instead of momentum.
