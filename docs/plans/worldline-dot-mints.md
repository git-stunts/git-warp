# Worldline Dot Mints

Status: proposed technical design

Target: [v21.0.0 — Bounded retained storage and recursive WARP](./v21.0.0/README.md)

Version boundary: MAJOR. Dot identity, version-vector keys, frontier keys and
strand ref layout change. Retained data migrates forward through a dedicated
script; legacy decoding lives only in that script.

Decision owner: git-warp maintainers

Parent tracker: [GitHub Issue #1012](https://github.com/git-stunts/git-warp/issues/1012)

## Problem

A dot is the unique identity of one add operation. OR-Set tombstones are global
and keyed only by dot, so two different adds that share a dot are removed
together. Uniqueness therefore depends on one rule: every `(id, counter)` is
minted at most once, by exactly one sequential minter.

Today no object owns that rule. `PatchBuilder` mints with
`versionVector.increment(writerId)`, so a dot is only as unique as the vector its
caller seeded. Four seeders build that vector independently:

| Seeder | Seed |
| --- | --- |
| `RuntimeHost` (open, materialize, sync) | materialized `observedFrontier` |
| `PatchController.createPatch` | host vector merged with the writer head context |
| `Writer.beginPatch` | the same merge, duplicated |
| `StrandPatchService` | strand `observedFrontier`, minting as the strand id |

Two defects follow from that:

1. **Lane dot reuse (#995, fixed in #1001).** Graph-first writers continued from
   a vector that lacked their own prior counters and re-minted used dots. The
   fix added the head-context merge to two seeders; it did not remove the class.
2. **Strand dot identity (this design).** Strand writes mint under the strand
   id (`writerId: descriptor.overlay.overlayId`). Strand ids are per lane, not
   per writer, and share one unmarked namespace with writer ids, so strand
   `next` and writer `next` produce the same dot ids. Every participant
   advances the single `strand-overlays/<strand>` ref. Today strand refs are
   clone-local (transfer is tracked in #999), so one clone is the only minter
   for an overlay and cross-clone collisions are latent. They become real the
   moment strand refs travel: John and Mary writing strand `next` in separate
   clones would both mint `(next, n)` for different adds and could never both
   fast-forward the overlay ref. This design is a prerequisite for #999.

## Decision

Introduce one minting authority per writer per worldline.

```text
Worldline (lane root or strand; shared by its participants)
├── Frontier: Map<MintId, head sha>      derived by listing chain refs
└── WriterChain (writer × worldline)
    ├── Head                             the chain ref's tip
    └── DotMint                          MintId(writer, worldline); counter from Head

Writer ── participates in ──▶ WriterChain (one per worldline it writes)

Patch (built on one WriterChain)
├── dots     minted only by that chain's DotMint
└── context  the VersionVector observed on the Worldline at build time
```

- **`MintId`** is a runtime value `(writer, worldline)` where `worldline` is
  `Root` or `Strand(id)`. It replaces the bare `writerId` string as the dot's
  identity and as the version-vector and frontier key.
- **`DotMint`** is the only producer of new dots. Its high-water mark is derived
  from its own chain head: the head patch's context entry for its `MintId`,
  raised to cover that patch's add dots. It never reads a shared frontier.
- **Version vectors stop minting.** `VersionVector.increment` no longer returns
  dots. The vector is causal context only: what a patch observed. Minting and
  observing are separate concerns; conflating them produced #995.
- **`Dot` construction outside decoding** goes through a mint. Decoders still
  construct dots from validated wire data.

### Persisted `MintId` encoding

Domain code handles `MintId` as a typed value. Where a `MintId` must become one
string (version-vector keys, patch context, frontier keys, the dot identity),
codecs encode it with kind sigils:

```text
@w.alice              alice on the root worldline
@w.alice@s.next       alice on strand "next"
@b.<id>               reserved for braids (no dots minted today)
```

Writer and strand ids are restricted to `[A-Za-z0-9._-]`, so `@` never occurs
inside an id and every `@`-prefixed segment is a sigil. Parsing splits on `@`
and dispatches on the kind letter. Unknown kinds are refused. A key without a
leading `@` is legacy data and is refused by the v21 codec; only the migration
script decodes it. `Dot.encode` stays `<mint-id>:<counter>`; the counter after
the last `:` is unambiguous because sigil ids contain no `:`.

### Ref layout

```text
refs/warp/<lane>/
├── substrate-version
├── writers/<writer>                     WriterChain heads on the root worldline
├── checkpoints/head
├── audit/<writer>, trust/records, …     unchanged
└── strands/<strand>/
    ├── descriptor                       was strands/<strand>
    ├── writers/<writer>                 was strand-overlays/<strand> (one shared chain)
    ├── braids/<support>                 was strand-braids/<strand>/<support>
    └── checkpoints/head                 optional strand materialization
```

- Each participant advances only its own chain ref, so strand sync behaves like
  lane sync: no shared ref is ever non-fast-forwarded.
- The descriptor moves because Git cannot store a ref and a directory at the same
  path.
- Fixed names (`descriptor`, `checkpoints`) and ids never share a level, so a
  writer named `descriptor` cannot collide.
- `strand-overlays` and `strand-braids` leave the reserved lane-name segment set.

### Settlement

Settlement already re-mints. Promotion turns each overlay patch back into an
intent sequence (`intentSequenceFromPatch`) and commits it on the settling
Runtime's root-worldline chain through `PatchController`, so strand dots never
reach the target lane. This design keeps that rule: strand dots are local to
their worldline, and promotion mints through the settling writer's root
`DotMint`. Retained-entity admission origins still record the original strand
`allocationDot` as provenance; that field becomes a `MintId`-keyed dot.

Braided support overlays contribute their original dots to strand
materialization only. Their dots are already distinct because each support has
its own `MintId`.

## Atomic delivery

| Unit | Outcome | Prerequisites |
| --- | --- | --- |
| [#1013](https://github.com/git-stunts/git-warp/issues/1013) DotMint | One minting authority per chain; every seeder routes through it. No format change; lane behavior unchanged; duplicated head-context logic removed. | none |
| [#1014](https://github.com/git-stunts/git-warp/issues/1014) Worldline identity format | `MintId` with sigil encoding in dots, contexts and frontiers; per-writer strand chains and the new strand ref layout; substrate marker bumped so unmigrated repositories refuse. | DotMint |
| [#1015](https://github.com/git-stunts/git-warp/issues/1015) v20→v21 migration | Forward-only script: re-keys lane chains to sigil keys, moves each strand overlay to its owner's chain in the new layout, scans for and reports duplicate dots (#1002), then advances the substrate marker. | Worldline identity format |

The format unit and the migration are separately mergeable because the substrate
gate refuses unmigrated repositories with an actionable error until the migration
lands; no mainline state silently misreads data. The major version bump ships
with the v21.0.0 release train.

## Migration contract

- Forward-only. No ref is deleted or rewritten in place; legacy refs remain until
  an operator removes them after verification.
- Lane chains are re-encoded into new commits whose dots, contexts and frontier
  keys use `@w.<writer>`. Counters are preserved, so causal order is preserved.
- Each legacy strand overlay chain moves to
  `strands/<strand>/writers/<owner>`, using the descriptor's recorded `owner`.
  A strand without an owner requires an explicit operator assignment; the
  migration refuses rather than guessing. Overlays were clone-local with one
  minter, so their counters are preserved and their dots are re-keyed from
  `<strand>` to `@w.<owner>@s.<strand>` without re-minting. Contexts, removes
  and admission-origin dots are re-keyed through the same mapping.
- Braid pins move to `strands/<strand>/braids/<support>`; descriptors move to
  `strands/<strand>/descriptor`.
- Duplicate dots found during the scan are reported with both add sites. The
  migration refuses to advance the marker while unresolved duplicates remain,
  unless the operator supplies an explicit resolution.
- The substrate marker advances last. A partial run leaves the repository on v20
  and resumable.

## Open questions

1. Whether strand audit chains are needed.
2. Duplicate-dot resolution policy for the migration when both add sites are
   live.
