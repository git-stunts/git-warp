# v21 Worldline Migration Guide

v21 gives every strand an immutable id and every strand writer its own dots
([#1012](https://github.com/git-stunts/git-warp/issues/1012)). Lane history
keeps its v20 encoding and is never rewritten. Strand history moves to a new
layout. A v21 runtime refuses a v19 or v20 repository with
`E_SUBSTRATE_MIGRATION_REQUIRED` until it has been migrated.

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
  migration. Repair is a separate, explicit operation
  ([#1022](https://github.com/git-stunts/git-warp/issues/1022)).
- **The marker advances last.** The record at
  `refs/warp/<graph>/migrations/worldline` journals progress. An interrupted run
  leaves the graph on v20, and rerunning resumes it with the same strand ids.

A strand whose view cannot be read (a missing object, a support strand that
could not be converted) is **blocked**: it stays on its legacy refs, is listed
in the report, and is unavailable in v21. The rest of the graph migrates.

Legacy refs (`strands/<name>`, `strand-overlays/*`, `strand-braids/*`) are
left in place. Remove them yourself once you have verified the result.

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
  They are listed so you can re-apply them on the converted strand.

A fresh v20.0.0 open of a migrated graph is refused with
`E_SUBSTRATE_VERSION_UNSUPPORTED`.
