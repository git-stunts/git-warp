# v21 Worldline Migration Guide

v21 gives every strand an immutable id and every strand writer its own dots
([#1012](https://github.com/git-stunts/git-warp/issues/1012)). Lane history
keeps its v20 encoding and is never rewritten. Strand history moves to a new
layout. A v21 runtime refuses a v19 or v20 repository with
`E_SUBSTRATE_MIGRATION_REQUIRED` until it has been migrated.

HTTP sync peers also require [signature v3 authentication](#http-sync-authentication).
Upgrade the client and server together; signature v2 is refused in every mode.

## Before you migrate

1. **Stop every git-warp v20 process on the repository.** v20.0.0 checks the
   substrate once per graph and caches the result, so a process that is
   already running keeps writing after the migration. The migration cannot
   stop it; it can only detect its writes (see [After you migrate](#after-you-migrate)).
2. **Back up the repository**, including `refs/warp/*`.
3. **Find ownerless strands.** A v19/v20 strand created without an owner
   cannot be converted without one. The migration lists them and changes
   nothing until you assign owners.

## Run the migration

```bash
npx git-warp-v20-to-v21 --repo ./team-repo
```

Options:

- `--graph <name>`: migrate only this graph (repeatable). Default: every
  graph.
- `--assign-owner <strand>=<writer>`: owner for a legacy strand that records
  none.
- `--check`: report late legacy writes; change nothing.

It prints one JSON report per graph, and exits 1 if any graph is refused.

## What the migration does

For each graph:

- **Lane history stays as it is.** Lane writer keys stay bare and no lane
  commit is rewritten.
- **Allocation floors.** Each lane writer's highest used counter is computed
  from its whole chain and stored at `refs/warp/<graph>/allocation/<writer>`.
  A writer whose counter was reset by an earlier bug then mints above every
  counter it ever used.
- **Strands are converted.** Each legacy strand gets an immutable id: the
  sha256 of a genesis record naming its owner's creation occurrence and its
  first legacy descriptor commit. Its overlay chain is rewritten to
  `refs/warp/<graph>/strands/<strand-id>/writers/<owner>`, and its dots move
  from `<name>:<n>` to `@w.<owner>@s.<strand-id>:<n>`. A strand is still
  addressed by its old name.
- **References keep their meaning.** A legacy dot can name a lane writer's
  dot or a strand's dot. Each one is resolved from the history it came from.
  A remove tombstones every identity its legacy dot denoted in its view, so
  what was hidden stays hidden.
- **Provenance is mapped, not rewritten.** An allocated entity's subject is
  derived from its allocation dot, so those bytes stay unchanged. The
  migration records what each one denoted. Resolve it with
  `resolveAllocationProvenance(commit, operationIndex, original)`, which returns
  `resolved`, `unmapped` or `ambiguous`.
- **Damage is reported, not repaired.** Duplicate dots and the collateral
  deletions they caused are listed in the report. They never block the
  migration. Repair is a separate, explicit operation (see
  [Repairing duplicate dots](#repairing-duplicate-dots)).
- **The marker advances last.** The record at
  `refs/warp/<graph>/migrations/worldline` journals progress. An interrupted run
  leaves the graph on v20, and rerunning resumes it with the same strand ids.

A strand whose view cannot be read (a missing object, a support strand that
could not be converted) is **blocked**: it stays on its legacy refs, is listed
in the report, and is unavailable in v21. The rest of the graph migrates.

Legacy refs (`strands/<name>`, `strand-overlays/*`, `strand-braids/*`) are
left in place. Keep them with your backup until you have verified the result,
checked for late writes, and resolved any blocked strands or reported late
strand writes.

## After you migrate

Run the check whenever a v20 process might still have been running:

```bash
npx git-warp-v20-to-v21 --repo ./team-repo --check
```

- **Late lane writes** stay readable, because the lane format is unchanged.
  Every lane commit beyond the recorded migration frontier is listed. Commits
  that reuse a counter at or below the recorded floor are flagged: that writer
  still mints from an unsafe seed. A v21 writer always mints above them.
- **Late strand writes** land on legacy strand refs, which v21 never reads.
  The check reports them; it does not replay them. The current public API has
  no write selector for a converted strand. Keep the legacy refs, backup and
  report, stop all v20 writers, and obtain an explicit reconciliation procedure
  before you remove legacy refs. Rerunning a completed migration returns
  `already-migrated`; it does not apply these late writes. The planned strand
  API in [#1053](https://github.com/git-stunts/git-warp/issues/1053) is not a
  recovery procedure for this data.

A fresh v20.0.0 open of a migrated graph is refused with
`E_SUBSTRATE_VERSION_UNSUPPORTED`.

## Repairing duplicate dots

Until a recorded lane collision is repaired, a remove that would tombstone its
shared dot is refused with `E_PATCH_REMOVE_SHARED_DOT`, because it would also
hide every other object carrying that dot.

```ts
const previews = await core.previewDotRepair();
// [{ dot: 'alice:1', members: [...], options: [{ policy: 'separate', ... }, ...] }]

await core.applyDotRepair({ dot: 'alice:1', policy: 'separate' });
await core.applyDotRepair({ dot: 'alice:7', policy: 'restore', targets: ['note:keep'] });
```

- `separate` gives every visible member its own dot. Visible state does not
  change.
- `restore` re-adds the members you select, including ones the shared dot
  already hid.

Either way, a remove of the shared dot that an offline replica already holds
no longer hides a re-added member. Read the preview before applying.

A repair appends ordinary patches under `repair.<your writer id>`, so two
clones repairing the same collision never mint the same dots. `repair.` writer
ids are reserved: opening a runtime or a writer with one is refused with
`E_WRITER_ID_RESERVED`. Each repair is recorded at
`refs/warp/<graph>/repairs/<id>` before it commits and again after it.
Repeating it, even after a crash between the two, returns that record instead
of minting again. A collision that is visible only inside a
strand cannot be repaired from the lane, because the strand's base is pinned.
It stays guarded.

## API changes

v21 removes the v20 write, strand and settlement capabilities of `Runtime`
and `Lane` ([#1054](https://github.com/git-stunts/git-warp/issues/1054)).
Writes go through `Warp`. Until [#1052](https://github.com/git-stunts/git-warp/issues/1052)
adds the Optic read, reads keep `Runtime.open()`, `runtime.lane()`,
`Lane.observe()`, the legacy `Optic` read, and `close()`.

| v20 | v21 |
| --- | --- |
| `lane.write(intent)` | `warp.as(writer).execute(intent)` |
| `lane.stageContent(text)` | `warp.as(writer).stage(text)` (text only) |
| `lane.name` | The graph name you passed to `runtime.lane()` |
| `lane.writer`, `runtime.writer` | The writer identity you pass to `warp.as(writer)` |
| `lane.kind`, `lane.descriptor`, `lane.reference` | Removed; no direct replacement |
| `Runtime.fork`, `Runtime.strand` | Removed; #1053 adds Coordinate-derived strands |
| `Runtime.previewSettlement`, `Runtime.settle` | Removed; #1053 adds strand settlement |
| `AuthoredWriteReceipt` | `WriteReceipt` |
| v20 `WriteReceipt`, `AdmissionOutcome`, `EntityOccurrence` | `RetainedWriteReceipt` and its siblings, `WriteAdmission`, `WriteOccurrence` |
| `SettlementPreview`, `SettlementPlan`, `SettlementReceipt`, `Runtime*Options` but `RuntimeOpenOptions` | Removed |
| `LaneDescriptor`, `LaneKind`, `LaneReference`, `CoordinateReference`, `ContentInput` | Removed |
| `git warp write`, `fork`, `settle`, `--strand` | Removed; write through `Warp` |
| MCP `warp_lane_describe`, `warp_intent_write`, `warp_settlement_*` | Removed |

`Warp.open` takes a `WarpAccessPort` that you implement. This example is
executed by `test/integration/application/V21MigrationExample.integration.test.ts`:

<!-- v21-migration-example -->
```ts
import {
  GitStorage, RetainedWriteReceipt, Runtime, Warp, WarpAccessPort, WarpAddress, WarpWriteGrant,
} from '@git-stunts/git-warp';
import type { WarpWriteRequest } from '@git-stunts/git-warp';
import { createEntityAdmissionInventoryObserver, intent } from '@git-stunts/git-warp/advanced';

class LocalAccess extends WarpAccessPort {
  override authorizeWrite(request: WarpWriteRequest): Promise<WarpWriteGrant> {
    return Promise.resolve(new WarpWriteGrant({
      authority: `local:${request.writer}`,
      budget: { records: 256, bytes: 1_048_576, work: 10_000 },
    }));
  }
}

export async function addAndListTodos(at: string): Promise<string[]> {
  const warp = await Warp.open(WarpAddress.of(GitStorage.at(at), 'todos'), new LocalAccess());
  try {
    const receipt = await warp.as('alice').execute(
      intent.entity.addAuto({ namespace: 'todo', properties: { title: 'buy milk' } }),
    );
    if (!(receipt instanceof RetainedWriteReceipt)) {
      throw new Error(`write not retained: ${receipt.constructor.name}`);
    }
  } finally {
    await warp.close();
  }
  const runtime = await Runtime.open({ at, writer: 'reader' });
  try {
    const lane = await runtime.lane('todos');
    const subjects: string[] = [];
    for await (const reading of lane.observe(createEntityAdmissionInventoryObserver('todos'))) {
      subjects.push(reading.value.representation.subject);
    }
    return subjects;
  } finally {
    await runtime.close();
  }
}
```

## HTTP sync authentication

Upgrade both HTTP sync peers to v21 before resuming authenticated sync. A v21
server refuses signature v2 before graph work with HTTP `400` and
`{"error":"SIG_VERSION_RETIRED"}` in enforce, `log-only`, and explicit
unauthenticated localhost modes. There is no v2 compatibility switch.

The normal runtime composes the host clock for signing and verification. Existing
shared secrets and key IDs keep their meaning. Direct users of `signSyncRequest`
must replace the `lamport` parameter with an injected `ClockPort` in the dependency
argument. Direct `SyncAuthService` and `HttpSyncServer` users must provide `clock`
alongside `replayProtection`. The port's `nowMs()` returns a non-negative safe
integer epoch millisecond. Tests should supply a clock that advances explicitly.

### Wire changes

`x-warp-sig-version` is `3`. `x-warp-timestamp` contains wall-clock epoch
milliseconds, rather than a Lamport counter. The client signs this canonical
payload with HMAC-SHA256:

```text
warp-v3|shared-secret-hmac-sha256|KEY_ID|METHOD|PATH|TIMESTAMP|NONCE|CONTENT_TYPE|BODY_SHA256
```

The version, authentication scheme, key ID, timestamp, nonce, and signature travel
in the six `x-warp-*` authentication headers. The method is uppercase and the path
includes the query string without its fragment. The existing optional absence of
the scheme header remains supported with the scheme field omitted from the
canonical payload; it does not restore signature v2 support.

### Clock and restart behavior

Keep client and server clocks within **300,000 ms (five minutes)** of each other.
In enforce mode, the server accepts both exact boundaries; one millisecond beyond either boundary
returns `403 EXPIRED`. The server checks freshness before storage and again after
reservation completes. A request already expired at the first check does not
reserve its nonce. If it expires while storage is awaited, the server refuses
graph work with `403 EXPIRED` and retains the reserved nonce.

The durable nonce retention interval is **600,001 ms**, with expiry calculated
from the clock snapshot at reservation entry. This covers a request first
admitted five minutes before its signed timestamp until one millisecond after
its final acceptable instant. In enforce mode, a restart returns `403 REPLAY`
for an admitted nonce while its timestamp is still fresh. Once the timestamp is outside the
freshness interval, verification returns `403 EXPIRED`, including after the
expired marker is swept.

The runtime's `ClockPort` signs requests and gives the early refusal. The final
freshness verdict and nonce retention both use the replay store's own time,
which is host time in the Git runtime. In enforce mode the server admits a
reserved request only when its signed timestamp is at most 300,000 ms after the
store time read on reservation entry and at most 300,000 ms before the store
time read after the store answers, both inclusive. Otherwise it returns
`403 EXPIRED` and retains the nonce. A caller-supplied `clock` therefore cannot
reopen the replay window. A request must be fresh on both clocks, so a `clock`
that disagrees with host time can refuse valid requests. A custom
`SyncReplayProtectionPort` must return both readings, `reservedAtMs` and
`completedAtMs`, from the clock that decides its expiry.

This replaces the process-local highest-Lamport check. Restarting a client does
not require preserving a signing counter. These guarantees assume synchronized
clocks that progress normally; arbitrary clock rollback is outside this contract.
Use enforce mode and TLS. Local `log-only` and explicit unauthenticated operation
remain permissive for supported and unsigned requests and do not provide
authenticated replay protection. They still refuse retired signature v2.

### Contract evidence

HTTP refusal evidence below uses enforce mode, except the retired-signature row,
which covers every mode.

| Requirement | Executable evidence | Exact oracle |
| --- | --- | --- |
| Signed timestamp | `SyncAuthService.clock.test.ts`: binds the wall-clock timestamp to the HMAC | Changing only the timestamp returns `401 INVALID_SIGNATURE`. |
| Inclusive skew bound | `SyncAuthService.clock.test.ts`: exact and one-millisecond-outside cases | Both ±300,000 ms boundaries pass; both ±300,001 ms cases return `403 EXPIRED`. |
| Retired signature | `HttpSyncServer.auth.test.ts`: refuses signature v2 in every mode | HTTP `400 SIG_VERSION_RETIRED`; no graph work in enforce, `log-only`, and explicit unauthenticated localhost modes. |
| Durable boundary | `GitCasSyncReplayProtectionAdapter.integration.test.ts`: future-dated request after storage restart | At 600,000 ms, sweep removes zero and replay is refused; at 600,001 ms, sweep removes one and timestamp is expired. |
| Storage await crosses expiry | `GitCasSyncReplayFreshness.integration.test.ts`: advances both clocks while a real storage sweep waits | Sweep removes the old marker and storage admits the nonce; HTTP still returns `403 EXPIRED`, with only the original graph request recorded. |
| Store-time verdict | `SyncAuthService.storeTime.test.ts`: both store readings at and one millisecond beyond their bounds | Each exact bound passes; one millisecond beyond returns `EXPIRED` with the nonce still reserved. |
| Stopped runtime clock | `GitCasSyncReplayFreshness.integration.test.ts`: injected clock stands still while host time passes marker expiry, and while a storage wait crosses it | HTTP `403 EXPIRED` in both cases, with only the original graph request recorded. |
| Post-reservation freshness | `SyncAuthService.reservationClock.test.ts`: unit clock crosses the inclusive boundary during reservation | `EXPIRED` after the wait; nonce remains reserved and the rate-limit token remains available. |
| Restart after window | `SyncAuthService.restart.test.ts`: captured request after restart | The expired marker is swept and the captured request returns `EXPIRED`. |

The unit cases live in `test/unit/domain/services/`. The durable case lives in
`test/integration/infrastructure/adapters/`. Run them through
`scripts/run-in-docker.sh` as required by the repository test policy.
