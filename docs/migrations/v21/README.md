# v21 Worldline Migration Guide

v21 gives every strand an immutable id and every strand writer its own dots
([#1012](https://github.com/git-stunts/git-warp/issues/1012)). Lane history
keeps its v20 encoding and is never rewritten. Strand history moves to a new
layout. A v21 runtime refuses a v19 or v20 repository with
`E_SUBSTRATE_MIGRATION_REQUIRED` until it has been migrated.

v21.0.0 has no supported repair for [duplicate dots](#duplicate-dots) and, like
v19 and v20, no public [HTTP sync](#http-sync-authentication) route.

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
  migration records what each one denoted in the record at
  `refs/warp/<graph>/migrations/worldline`. In v21.0.0, no package entry point
  and no `git warp` command reads that mapping.
- **Damage is reported, not repaired.** Duplicate dots and the collateral
  deletions they caused are listed in the report. They never block the
  migration, and v21.0.0 has no supported repair for them (see
  [Duplicate dots](#duplicate-dots)).
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

## Duplicate dots

v21.0.0 has no supported repair for duplicate dots. No package entry point and
no `git warp` command repairs them
([#1154](https://github.com/git-stunts/git-warp/issues/1154)). A migrated lane
keeps the interpretation that the migration preserved, and v21 refuses the
writes that would extend the damage:

- **A remove of a shared dot is refused.** When the report lists a duplicate
  dot but no collateral deletion for the lane, a write that removes a node or an
  edge that carries the dot would also hide every other object that carries
  it. `warp.as(writer).execute()` rejects that write with error code
  `E_PATCH_REMOVE_SHARED_DOT`; it returns no receipt, and nothing is written.
  Writes that do not remove such an object are not affected.
- **A lane with a collateral deletion accepts no writes.** When the report lists
  a collateral deletion for the lane, its history already holds a remove of a
  shared dot. Every write to that lane returns an `UnpublishedWriteReceipt`
  with cause `cone_shared_dot` and the repair hint code `repair_duplicate_dot`.
  A retry gives the same result.
- **Reads keep the preserved interpretation.** `Lane.observe()` reads an object
  that the report lists as a collateral deletion as absent.
- **`repair.` writer ids are reserved.** A write as a writer whose id starts
  with `repair.` is refused with `E_WRITER_ID_RESERVED`.

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

v21.0.0 has no public HTTP sync client or server. No package entry point
exports one, and the `git warp` CLI has no sync command. v19 and v20 had none
either. Clones exchange WARP history through Git ref and object transfer, as
[Sync WARP refs](https://github.com/git-stunts/git-warp/blob/dd75d0d5f348b7810363c7fc77c4594cfee9b2d1/docs/topics/sync.md)
describes.

Inside the package, HTTP sync now authenticates with signature v3 and refuses
signature v2 in every mode. The
[sync authentication model](https://github.com/git-stunts/git-warp/blob/dd75d0d5f348b7810363c7fc77c4594cfee9b2d1/.github/SECURITY.md#sync-authentication-shield)
describes that protocol.
