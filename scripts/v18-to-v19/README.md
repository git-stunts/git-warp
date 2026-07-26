# v18-to-v19 Retained-Substrate Migration

This directory owns every v18 retained-substrate reader and translator needed
by the one-shot v19 migration. Production runtime code only recognizes the
exact v19 marker and fails closed for non-empty unmarked timelines.

The migration has four boundaries:

1. Inventory every graph ref and every writer commit without writing.
2. Recreate the graph in a disposable repository, translating legacy patch
   trailers and raw content OIDs into explicit git-cas asset handles while
   preserving current audit, intent, strand, overlay, braid, and trust refs.
3. Translate a retained v18 checkpoint when available, rebuild current bounded
   indexes from its authoritative state, replay only the writer tail, then
   prove a public v19 read and a disposable v19 append. Repositories without a
   usable checkpoint safely fall back to full writer-history materialization.
4. Recheck source heads and atomically promote all verified refs while retaining
   old refs and state-cache payload roots below additive recovery refs.

The default command stops after boundary 3. `--apply` explicitly enables
boundary 4.

Stop every process that can write to the repository and make a normal backup.
After installing v19 without starting the application, run the disposable
proof:

```bash
npx git-warp-v18-to-v19 \
  --repo /path/to/repository \
  --graph events
```

Progress is written to standard error so long writer chains remain observable.
Use `--json` when a machine-readable report is needed on standard output. For
encrypted v18 patches, provide `GIT_WARP_MIGRATION_PASSPHRASE` in the
environment; the passphrase is never accepted as an argument or included in
the report.

Monolithic v18 checkpoint CBOR is decoded only inside this migration with a
64 MiB byte ceiling plus explicit depth and item limits. The normal v19 runtime
keeps its stricter 5 MiB decode boundary.

Only after the dry-run reports `verified-dry-run`, promote the verified refs:

```bash
npx git-warp-v18-to-v19 \
  --repo /path/to/repository \
  --graph events \
  --apply
```

Promotion re-inventories the source, detects concurrent ref movement, and uses
one compare-and-swap Git ref transaction. Original refs and blob-backed
state-cache payload roots remain reachable below
`refs/warp/<graph>/recovery/v18-to-v19/<run-id>/`. Keep those recovery refs
until application reads, writes, and backups have been independently verified.
Rerunning the command after promotion verifies the current repository and
reports `already-current`.

Preserved refs must already target publication commits. A blob or tree below a
current retained-ref family is pre-v18 state; the command stops before scratch
work and requires that older one-shot migration first. No reader for those
retired shapes exists in production v19.

The golden fixture under `fixtures/v18/retained-substrate-golden/` was produced
with the published `@git-stunts/git-warp@18.2.1` dependency lock. It contains
no live user or Think data. The medium fixture under
`fixtures/v18/retained-substrate-medium/` uses the same published dependency
lock and carries 18 authentic patches, deterministic binary attachments, a
schema-5 checkpoint, and a three-commit replay tail in an approximately 2 MiB
Git bundle. It is the routine end-to-end sanity proof; the much larger
disposable application-store rehearsal is reserved for release candidate
validation.
