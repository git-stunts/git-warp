# v18-to-v19 Retained-Substrate Migration

This directory owns every v18 retained-substrate reader and translator needed
by the one-shot v19 migration. Production runtime code only recognizes the
exact v19 marker and fails closed for non-empty unmarked timelines.

The migration has five boundaries:

1. Discover every graph namespace and report whether it is current, needs this
   upgrade, or has an unsupported retained shape.
2. Inventory every selected-graph ref and every writer commit without writing.
3. Recreate the graph in a disposable repository, translating legacy patch
   trailers and raw content OIDs into explicit git-cas asset handles while
   preserving current audit, intent, strand, overlay, braid, and trust refs.
4. Translate a retained v18 checkpoint when available, rebuild current bounded
   indexes from its authoritative state, replay only the writer tail, then
   prove a public v19 read and a disposable v19 append. Repositories without a
   usable checkpoint safely fall back to full writer-history materialization.
5. Recheck source heads, atomically promote all verified refs while retaining
   old refs and state-cache payload roots below additive recovery refs, then
   verify the promoted graph through another disposable append and bounded
   public reading.

Stop every process that can write to the repository and make a normal backup.
After installing v19 without starting the application, run the migration:

```bash
npm exec --package=@git-stunts/git-warp@19.1.0 -- git-warp-v18-to-v19 \
  --repo /path/to/repository \
  --graph <graph-name>
```

The command discovers the repository's graph names before it does migration
work. If `<graph-name>` is wrong, it stops with `Graph not found` and lists the
graphs it did find, including their version posture, writer count, and ref
count. A repository may contain any number of independently named graphs.

In an interactive terminal, the command displays the selected graph and exact
mode in a framed application, then waits for confirmation before inventory or
scratch work. The preflight reads `git count-objects -v` and filesystem
capacity, reports the complete Git object-store byte size and object count,
source and scratch free space, and a scratch operating budget that accounts
for both byte volume and loose-object allocation blocks. Counting the complete
store is conservative for a repository with several graphs, because shared
and blob-indirected objects cannot be attributed reliably before inventory.
After confirmation, the normal command completes all five boundaries in one
pass. Long writer chains remain observable through the current phase, writer,
count, and progress bar.

For automation, pass `--yes`; progress is written to standard error and the
final report to standard output. Add `--json` for a machine-readable report.
For encrypted v18 patches, provide `GIT_WARP_MIGRATION_PASSPHRASE` in the
environment; the passphrase is never accepted as an argument or included in
the report.

The scratch and disposable verification repositories default to the operating
system's temporary volume. Use `--scratch-root <path>` to place all migration
temporaries on a volume with more space. The exact size depends on reachable
Git objects and checkpoint state. The reported operating budget is the greater
of four times the current object-store bytes and the object-store bytes plus
one scratch-filesystem allocation block for every current Git object. Scratch
and verifier repositories are deleted after success or failure. Promotion
retains recovery refs in the source repository, so do not expect the source
repository to shrink during migration.

Monolithic v18 checkpoint CBOR is decoded only inside this migration with a
64 MiB byte ceiling plus explicit depth and item limits. Promoted verification
does not call full graph materialization: it fetches the promoted refs into
another disposable repository, appends a canary, reads it through the bounded
public API, and validates its receipt.

Use `--dry-run` only when you explicitly want a disposable rehearsal:

```bash
npm exec --package=@git-stunts/git-warp@19.1.0 -- git-warp-v18-to-v19 \
  --repo /path/to/repository \
  --graph <graph-name> \
  --dry-run
```

The rehearsal performs and verifies the complete scratch migration but
discards the result without changing authoritative refs. A later normal run
must repeat that work because the disposable repository is intentionally not
trusted or retained across invocations. `--apply` remains accepted as a
compatibility alias for the normal one-pass behavior; it is no longer required.

Promotion detects concurrent ref movement and uses one compare-and-swap Git ref
transaction. Original refs and blob-backed state-cache payload roots remain
reachable below
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
