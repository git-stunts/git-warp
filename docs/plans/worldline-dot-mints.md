# Worldline Dot Mints

Status: accepted and implemented for v21.0.0: #1013 (PR #1017), #1018 (PR
#1019), #1021 (PR #1026), #1014 (PR #1027), #1015 (PR #1028) and #1022 (PR
#1029). Amended twice on 2026-10-20 after external review. Fencing
publications for the next marker change is #1025.

Target: [v21.0.0 — Bounded retained storage and recursive WARP](./v21.0.0/README.md)

Version boundary: MAJOR. Strand dot identity, strand version-vector and
frontier keys, and the strand ref layout change. Lane history keeps its v20
encoding and is not rewritten. Legacy strand decoding lives only in the
migration.

Decision owner: git-warp maintainers

Parent tracker: [GitHub Issue #1012](https://github.com/git-stunts/git-warp/issues/1012)

## Problem

A dot is the unique identity of one add operation. OR-Set tombstones are global
and keyed only by dot, so two different adds that share a dot are removed
together. Uniqueness therefore depends on one rule: every `(id, counter)` is
minted at most once, by exactly one sequential issuer.

Before #1013 no object owned that rule. `PatchBuilder` minted with
`versionVector.increment(writerId)`, so a dot was only as unique as the vector
its caller seeded. Four seeders built that vector independently:

| Seeder | Seed |
| --- | --- |
| `RuntimeHost` (open, materialize, sync) | materialized `observedFrontier` |
| `PatchController.createPatch` | host vector merged with the writer head context |
| `Writer.beginPatch` | the same merge, duplicated |
| `StrandPatchService` | strand `observedFrontier`, minting as the strand id |

Three defects follow:

1. **Lane dot reuse (#995, fixed going forward in #1001 and #1013).** Writers
   continued from a vector that lacked their own prior counters and re-minted
   used dots. The v19.1.0 fixture (#1018) shows this is common in retained
   history: any writer that opened a lane in more than one session repeated
   its counters. One remove then deletes unrelated objects
   (`dot-reuse-tombstone`).
2. **Head-only seeding is unsafe for legacy chains (#1021).** After a counter
   reset, a chain's head can sit below counters the writer already used
   (`counter-reset`: 100 adds, restart, head context says 1). A mint seeded
   only from that head reuses dots on unmaterialized writes.
3. **Strand dot identity (this design).** Strand writes mint under the strand
   name (`writerId: descriptor.overlay.overlayId`).
   - Strand names share one unmarked namespace with writer ids, so strand
     `next` and writer `next` produce the same dot ids (`collision`,
     `collision-remove`).
   - Every participant advances the single `strand-overlays/<strand>` ref.
     Strand refs are clone-local today; transfer is #999. Once they travel,
     John and Mary writing strands named `next` in separate clones would both
     mint `(next, n)` for different adds and could never both fast-forward
     the overlay ref.

## Decision

Introduce one issuing authority per writer per worldline, and give worldlines
an identity that survives names and clones.

```text
Worldline (lane root, or a strand with an immutable id)
├── Frontier: Map<MintId, head sha>      derived by listing chain refs
└── WriterChain (writer × worldline)
    ├── Head                             the chain ref's tip
    └── DotMint                          MintId(writer, worldline); starts above the allocation floor

Patch (built on one WriterChain)
├── dots     issued only by that chain's DotMint
└── context  the VersionVector observed on the Worldline at build time
```

- **`MintId`** is a runtime value `(writer, worldline)`, where `worldline` is
  `Root` or `Strand(id)`. It is the dot's identity and the key for version
  vectors and frontiers.
- **`DotMint`** (#1013) is the only producer of new dots. It issues dots and
  never touches a caller's vector. The owner records each issued dot in its
  own context.
- **Allocation is not observation.** The mint starts above an **allocation
  floor**: the highest counter the `MintId` has ever used, including
  outstanding reservations such as queued strand intents. For chains written
  by the mint, the head is a valid floor. Legacy chains get a floor computed
  from retained history and persisted (#1021). Knowing a counter is used does
  not mean the writer observed the operation that carries it, so the floor is
  never merged into a patch's causal context.
- **Floor storage.** A lane writer's floor is a blob at
  `allocation/<writer>` recording the counter and the chain head it was
  computed through. Opening the writer walks only the commits after that head
  and replaces the blob with compare-and-swap; a lost race recomputes, so a
  concurrent reservation is never lost. A commit that lands after the walk is
  not lost either: the floor names the head it covers, and the next open
  walks from the then-current head back to it. A strand writer's floor is not
  stored: strand chains are written only by the mint, so every open derives
  it from the whole chain plus its queued intents.
- **Reservation is not issuance.** `reserveAllocation` takes the next counter
  above the floor and persists it before returning, without issuing a dot. A
  reserved counter never appears on an add, in a remove's observed dots, or in
  a patch context.
- **One sequential issuer per `MintId`.** Two processes writing as `alice` on
  the same worldline, in different clones, can issue the same counter. A
  `DotMint` cannot prevent that across clones. The rule is stated, and it is
  enforced where it can be detected: a writer ref that would not fast-forward
  is never merged into a shared counter. Distinct processes need distinct
  writer ids.

### Strand identity

A strand's `MintId` uses an immutable **strand id**, not its friendly name.

Hashing the first descriptor commit does not work. A v19 descriptor embeds
`strandId` in its own JSON, so the id would depend on itself. Commit bytes are
also deterministic: with fixed author time and identical inputs, two creations
produce the same commit (the fixture generator relies on exactly that).

Instead, creating a strand writes a **genesis record** that names one
creation occurrence and never contains the strand id:

```text
Genesis
├── lane          the root worldline the strand forks from
├── creator       MintId of the creating writer on the lane
├── occurrence    a counter issued by the creator's lane DotMint
├── name          the friendly name at creation
└── base          digest of the pinned base observation
```

The strand id is the lowercase hex sha256 of the UTF-8 canonical JSON of
`{ kind: 'git-warp-strand-genesis', lane, creator, occurrence, name, base }`
(`canonicalStringify`: object keys sorted by UTF-16 code unit, no whitespace,
JSON string escaping, integers in decimal). Names are compared as exact
strings, with no Unicode normalization.

- **Uniqueness without entropy.** The occurrence is reserved from the
  creator's lane floor (#1021) before the genesis record is published. Under
  the one-issuer rule, two creations never share an occurrence, even with
  identical inputs and frozen clocks. The guarantee is exactly as strong as
  that rule: one writer id used by two clones can produce identical genesis
  records, and then identical ids, just as it can produce identical dots.
- **Idempotent retry.** `createStrand` returns the occurrence as a creation
  token. A retry by the same creator with that token and the same name
  returns the existing strand; a different name is refused
  (`E_STRAND_CREATION_TOKEN_MISMATCH`). A call without a token is a new
  creation and consumes a new counter. The token is returned only after the
  genesis record is published; a creation that fails after its reservation
  wastes that occurrence, which is never reissued.
- **Stable.** Sharing a strand preserves its id, and renaming it does not
  change its mints. Deleting and recreating `next` never reuses an old
  namespace.
- **Legacy strands.** The migration writes the same genesis shape, plus the
  sha of the strand's first legacy descriptor commit. Its occurrence is issued
  by the owner's lane `DotMint` during migration and recorded in the migration
  journal, so a resumed run reuses it. A deterministic legacy commit alone is
  not enough: two clones holding byte-identical legacy strands would derive
  the same id and then both issue `@w.<owner>@s.<id>` dots.

The friendly name lives in the descriptor.

### Persisted `MintId` encoding

Domain code handles `MintId` as a typed value. Where it must become a string
(version-vector keys, patch context, frontier keys, dot identity), codecs use
exactly **one canonical spelling per identity**:

```text
alice                         alice on the lane (root worldline), unchanged from v20
@w.alice@s.<strand-id>        alice on a strand
@b.<id>                       reserved for braids (no dots are minted today)
```

Writer ids are restricted to `[A-Za-z0-9._-]` (v19 and later), so `@` never
occurs inside an id.

- A key without `@` is a root-worldline writer.
- Every `@` begins a sigil. Parsing splits on `@` and dispatches on the kind
  letter.
- Unknown kinds are refused, and so are alternate spellings of an existing
  identity, such as `@w.alice` for a lane writer. Ordinary runtime data never
  accepts two spellings of one identity.
- `Dot.encode` stays `<mint-id>:<counter>`. The counter after the last `:` is
  unambiguous because no spelling contains `:`.

Keeping lane keys bare means lane commits, and everything that references them
(receipts, signatures, audit chains, checkpoints, other clones' unsynced work),
are untouched by the upgrade.

### Ref layout

```text
refs/warp/<lane>/
├── substrate-version                    version 21
├── writers/<writer>                     WriterChain heads on the root worldline (unchanged)
├── allocation/<writer>                  allocation floor blob, clone-local (#1021)
├── migrations/v21                       migration record blob (#1015)
├── checkpoints/head
├── audit/<writer>, trust/records, …     unchanged
└── strands/<strand-id>/
    ├── descriptor                       name, genesis, owner, base observation (schema 2)
    ├── writers/<writer>                 was strand-overlays/<strand> (one shared chain)
    └── braids/<support-id>/<writer>     was strand-braids/<strand>/<support>
```

- Each participant advances only its own chain ref, so strand sync behaves like
  lane sync: no shared ref is ever non-fast-forwarded.
- Fixed names (`descriptor`, `checkpoints`) and ids never share a level, so a
  writer named `descriptor` cannot collide with them.
- `strand-overlays` and `strand-braids` leave the reserved lane-name segment set;
  `allocation` and `migrations` join it.
- The descriptor is not rewritten when a writer patches the strand: chain heads
  are read from each writer's ref, so writers never contend on it. A braid
  pins every writer chain of a support strand. A strand view reads every
  writer chain.

### Settlement and provenance

Settlement re-mints membership. Promotion turns each overlay patch back into an
intent sequence (`intentSequenceFromPatch`) and commits it on the settling
writer's root chain, so strand **membership** dots never reach the lane. A
settlement plan is bound to the target frontier it previewed, so once its
promotion commit lands, a retried plan is stale and refused: a retry after an
unknown outcome cannot promote twice. This design does not change that.

Strand identities still reach lane history through **provenance**. A retained
entity's admission origin records its original strand `allocationDot`, and
that field is persisted in lane patches. "Strand dots never reach the lane"
therefore holds for membership only. This is why the migration resolves
references by origin and keeps a verifiable mapping (see below).

Braided support overlays contribute their original dots to strand
materialization only. Their dots are distinct because each support strand has
its own `MintId`.

## Atomic delivery

| Unit | Outcome | Prerequisites |
| --- | --- | --- |
| [#1013](https://github.com/git-stunts/git-warp/issues/1013) DotMint | One issuing authority per chain; every seeder routes through it. No format change. | none |
| [#1018](https://github.com/git-stunts/git-warp/issues/1018) v19.1.0 fixture | Authentic legacy history with golden, edge-case and known-failure scenarios. | none |
| [#1014](https://github.com/git-stunts/git-warp/issues/1014) Worldline identity format | `MintId` with one canonical spelling; strand ids from genesis records with idempotent creation tokens; per-writer strand chains; substrate marker bumped so unmigrated repositories refuse. | #1013, #1021 (the creation occurrence is a persisted reservation) |
| [#1021](https://github.com/git-stunts/git-warp/issues/1021) Allocation floor | Trustworthy, persisted floor for legacy chains, covering reservations such as strand-creation occurrences, re-established when late legacy commits arrive. | #1013 |
| [#1015](https://github.com/git-stunts/git-warp/issues/1015) v20→v21 migration | Preserves existing interpretation: converts strands, fans removes out, establishes floors, maps and resolves provenance, contains late legacy writes, reports damage. | #1014, #1021, #1018 |
| [#1022](https://github.com/git-stunts/git-warp/issues/1022) Duplicate-dot repair | Explicit, previewed, audited and idempotent repair, separate from migration. | #1015 |

The format unit and the migration can merge separately. Until the migration
lands, the substrate gate refuses unmigrated repositories with an actionable
error, so no mainline state silently misreads data. The major version bump
ships with the v21.0.0 release train.

## Migration contract

Migration **preserves the existing interpretation of history** and reports
damage. It never makes new decisions about the user's data.

- **Forward-only.** No ref is deleted or rewritten in place. Lane chains are
  untouched. Legacy strand refs remain until an operator removes them after
  verification.
- **Lane history reads unchanged.** Untouched lane bytes need no read-side
  translation. Lane removes observe only lane membership dots, and lane
  contexts carry only lane keys, because settlement re-mints strand membership
  and strand overlays never fold into lane state. Only a retained
  `allocationDot` can name a strand dot, and the provenance resolver covers
  it. The v19.1.0 fixture checks that every migrated lane reads exactly as
  v19.1.0 did.
- **Allocation floors.** For each lane writer, compute the floor from its
  whole retained chain and persist it at `allocation/<writer>`, so reopening,
  cancelling or checkpointing cannot lower it (#1021). Strand writer floors
  are not stored: a converted strand chain keeps its counters, and every open
  derives the floor from the whole chain plus queued intents.
- **Strand conversion.**
  - Each legacy overlay chain moves to `strands/<strand-id>/writers/<owner>`,
    using the descriptor's recorded `owner`.
  - A strand without an owner requires an explicit operator assignment. The
    migration refuses rather than guessing.
  - Overlays were clone-local with one issuer, so their counters are preserved
    and their dots re-keyed to `@w.<owner>@s.<strand-id>`.
- **Resolve by origin, not by string.** A legacy `next:1` can name a lane
  writer's dot or a strand's dot (`collision-remove`). Each context entry,
  remove and admission-origin `allocationDot` is resolved from the history it
  came from and the basis it observed.
- **Removes fan out.** A legacy remove tombstoned every add carrying its
  observed dot in the view where it was applied, including collateral
  deletions. A translated remove therefore tombstones **every** translated
  identity that the legacy dot denoted in that view, so what was deleted stays
  deleted (`shared-dot-strand-remove`).
- **Unknown views block one strand.** If the migration cannot establish which
  identities a remove's view contained, it does not guess. That strand's
  conversion is blocked and reported. It stays on its legacy refs, unavailable
  in v21, until an operator resolves it; the rest of the repository migrates.
- **Cross-origin aliases.** No released version can put one legacy dot on both
  a lane object and a strand object in one view: strand mints start above the
  strand's `observedFrontier`, bases are fixed at creation, and braids require
  identical pinned bases (`E_STRAND_COORDINATE_INVALID`). The fan-out rule
  still covers the case, and a labelled synthetic test exercises it.
- **Provenance.** Source objects are preserved. The migration writes a
  verifiable mapping keyed by source occurrence (commit sha and operation
  index), from each legacy identity to its new one. Strands are local, but
  other data can still reference them.
- **Provenance resolver.** v21 readers never interpret a legacy
  `allocationDot` through the ordinary `MintId` codec. A resolver keyed by
  source occurrence returns the original bytes, unchanged, together with one
  typed outcome (`resolveAllocationProvenance(commit, operationIndex,
  original)`, backed by the record at `migrations/v21`):
  - `resolved`: the v21 identity;
  - `unmapped`: no mapping exists, for example a commit that arrived after
    migration;
  - `ambiguous`: the evidence named more than one identity.

  A reader resolves an admission by the commit it read the patch from and the
  admission's operation index, which every patch already carries; nothing new
  is persisted in lane patches. All three outcomes are provenance only:
  membership and materialization never depend on them.
- **Damage report.**
  - Duplicate dots are reported with all their add sites.
  - Collateral deletions are detected from each remove's named target and
    reported too.
  - Duplicates **do not block** the migration. Refusing would block nearly
    every real repository.
- **Ordering.** The substrate marker advances last. A partial run leaves the
  repository on v20, and the migration can be resumed from its journal.

### Migration boundary

v20.0.0's `SubstrateVersionGate` caches its first successful check per graph,
and nothing can change a process that is already running. Advancing the
marker last therefore does not fence open v20 clients. The contract is
containment, not prevention:

- **Procedure.** The operator stops legacy processes before migrating. The
  migration records the frontier it migrated (the **migration frontier**).
- **Late lane writes.** A v20 process that keeps writing to a lane stays
  readable, because lane keys are unchanged. Lane commits beyond the migration
  frontier are detected as late legacy arrivals. They raise the writer's
  allocation floor (#1021) before that writer mints again in v21, and they
  are reported, because v20.0.0 still mints from an unsafe seed. The report
  only observes: a v20 process that keeps running keeps minting from that
  seed, so every later commit it publishes is another reported damage window
  until the process stops. v21 writers still mint above all of it.
- **Late strand writes.** These land on legacy strand refs that v21 never
  reads. They are reported, never silently dropped or merged.
- **Late arrivals by sync.** Another clone's v20 commits are handled the same
  way when they arrive.
- **Fencing the next boundary.** A v21 process that opened before a later
  marker change would keep writing in the same way. Before any later marker
  change, every publication must verify the marker in the same atomic ref
  transaction as its update (#1025). Most publications go through git-cas,
  which needs an option for that first.
- **Acceptance.** A real v20.0.0 process, opened before migration, writes to a
  lane and to a strand afterwards; each outcome above is asserted. A fresh v20
  open after migration is refused.

## Repair contract (separate from migration)

Repair changes future behaviour, so it is an explicit operator action
(#1022). Re-adding both members of a duplicate with fresh dots protects the
innocent object. It also defeats any pending remove of the other object that
an offline replica already holds. Syncing first narrows that window but cannot
close it.

- **Preview.** List the affected objects, their add sites, the policy options
  and their consequences, including pending-remove behaviour.
- **Apply.** Append ordinary repair patches under a repair writer.
- **Distinct repair writer.** The repair writer id is derived from the
  operator's own writer id on that clone, for example `repair.alice`. It is
  never a fixed name shared across clones: two clones repairing from different
  frontiers under one writer id would issue the same repair dots and recreate
  the collateral deletion the repair exists to prevent. The `repair.` prefix
  is reserved: a runtime or writer cannot be opened with it
  (`E_WRITER_ID_RESERVED`). Its uniqueness rests on the same one-issuer rule
  as the operator's own writer id.
- **Record.** Store the input frontier, affected add sites, chosen policy and
  resulting commits at `repairs/<repair-id>`. The repair id is the sha256 of
  the canonical JSON of the dot, policy, sorted selection and repair writer.
  The repair derives its writer internally; ordinary runtime and writer
  creation keep refusing the prefix.
- **Idempotent.** The record is written as `pending`, with the repair
  writer's chain head, before the repair commits, and as `applied` after.
  A retry finds the record: `applied` returns it; `pending` takes the commit
  that follows the recorded head if one exists, and commits otherwise. A
  retry never mints another batch. One repair writer serves every repair, so
  a repair does not start while another of that writer is pending, and a
  pending repair adopts only a commit that adds exactly its targets.
- **Guard.** Until a collision is resolved, a remove that would tombstone a
  shared dot cannot silently cause a new collateral deletion (#1002).

## Resolved questions

1. **Rewrite lane history?** No. Lane keys stay bare, with one canonical
   spelling per identity.
2. **Refuse migration on duplicates?** No. Report the damage and preserve
   access. Repair is a separate, explicit operation.
3. **Strand audit chains?** Deferred. Nothing depends on them, and they can be
   added later without another format change.
4. **Braid sigil.** `@b` stays reserved.
5. **Strand id source?** A genesis record bound to a creation occurrence, not
   the first descriptor commit, which is self-referential and deterministic.
6. **Fence running v20 clients?** Impossible after the fact. Stop them, then
   detect and report late legacy writes.
