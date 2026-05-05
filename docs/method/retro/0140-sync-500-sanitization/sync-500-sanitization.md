# 0140 Sync 500 Sanitization Retro

## Outcome

`HEX_sync-500-sanitization` is closed. Unexpected HTTP sync server failures
now return a stable generic `500` response instead of the thrown exception
message, and the original `Error` is logged through `LoggerPort`.

This keeps client-facing protocol errors useful while preventing internal
server details from crossing the HTTP boundary during unexpected failures.

## What Went Well

- The RED was already almost sitting in the suite: the old test expected the
  leaked thrown message.
- The fix stayed in the HTTP sync response layer and did not touch sync
  protocol success semantics.
- Logger plumbing was small because `SyncServerLauncher` already knows about
  the host logger for auth.

## What Was Messy

- `HttpSyncServer` had auth logger plumbing but no top-level server logger,
  so unexpected graph failures had nowhere honest to go.
- The old test encoded the leak as expected behavior, which is exactly the
  kind of stale executable spec this release cleanup has been burning down.
- The next node is not a feature fix; it is quarantine accounting, so it may
  uncover older sludge in files touched across the whole v17 branch.
- The first full `test:local` rerun caught release-home count drift from the
  response paging follow-up backlog card; the triage table had to be updated
  before the unit matrix went green.

## SSJS Scorecard

- Runtime-backed forms for new concepts: not applicable; this is a response
  helper and logger wiring slice.
- Boundary validation stays at boundaries: pass. The new logger option is
  parsed with the server option schema.
- Behavior lives on the owner: pass. HTTP response sanitization lives in
  `HttpSyncServer`.
- No message parsing for behaviorally significant branching: pass.
- No ambient time or entropy in new domain code: pass.
- No fake shape trust or cast-cosplay in production code: pass.

## Follow-Up

Pull `REL_quarantine-graduate-clean` next. The direct sync security blockers
are now complete, so the release DAG has reached the near-end cleanup node.

## Battle Report

The server used to shout the exact thing that broke. That is handy in a
terminal and reckless over HTTP. Now clients get a stable "sync failed" code,
operators get the real error in logs, and the next fight is with the old
quarantine ledger.
