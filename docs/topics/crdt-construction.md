# CRDT construction and checkpoint admission

This page describes the current source's internal CRDT admission contract. It does not add constructors to the supported Runtime package surface. The change tracked by [#189](https://github.com/git-stunts/git-warp/issues/189) validates construction and persistence hydration; membership retirement and garbage collection remain separate operations.

## Membership collections

`ORSet` requires a `Map` from string elements to `Set` collections of canonical encoded dots, plus a `Set` of canonical tombstones. Every dot passes the existing `Dot` admission rules. Non-string elements, non-Set collections and malformed identity keys fail during construction.

Construction copies the outer map, every nested dot set and the tombstone set. Later mutation of caller-owned collections cannot change the constructed value. The admitted ORSet remains mutable during reduction; this contract does not freeze its working storage or change add, remove, join and compaction behavior.

Empty string elements and empty dot collections remain admissible. Floating tombstones remain valid even when their additions have not arrived, in the in-memory `ORSet` and in the session trie (see "Remove operations and empty observed dots"). A later matching add stays removed; constructor validation must not discard that causal evidence.

## Remove operations and empty observed dots

This law is the decision for [#193](https://github.com/git-stunts/git-warp/issues/193). A `NodeRemove` or `EdgeRemove` deletes only the add dots that it lists in `observedDots`. Its observed dots are expected to belong to its named owner. The reducers check this only inside one patch (see below); for a dot that another patch added to a different element, the in-memory and session reducers still differ ([#1120](https://github.com/git-stunts/git-warp/issues/1120)). The law has three rules:

1. A remove must name its owner. A `NodeRemove` without `node`, or an `EdgeRemove` without `from`, `to` and `label`, is malformed. Every reducer path refuses it with `PatchError` (`E_PATCH_MALFORMED`). The persisted-patch decode boundary already refused these shapes, and the patch builder cannot write them, so the rule does not make a readable history unreadable. Sync responses do not pass through that decode boundary. `applySyncResponse` refuses a whole response that contains an ownerless remove and leaves the caller's state unchanged. A conforming git-warp peer cannot send this shape, because it serves patches that it read through the decode boundary.
2. A remove that names its owner and lists no dots is a lawful explicit no-op. This is true when the owner is absent and when the owner is alive. The receipt reports `redundant` for the named owner. The remove does not advance the owner's lifecycle: node properties stay visible, and no edge-remove event is recorded.
3. A remove never deletes an add that it did not observe. A concurrent add stays present in every join order, whether the remove lists dots or not.

The rules hold on both reducers: the in-memory reducer (`reducePatches`, `applySyncResponse`, memory storage) and the session reducer that Git storage uses. A remove that arrives before the add it observed still deletes that add, on both reducers and on every materialize path ([#1119](https://github.com/git-stunts/git-warp/issues/1119)). A full replay streams writer chains in writer-id order, so this case is ordinary with two or more writers. The session trie keeps the tombstone for such a dot under the named element's entry, in the existing per-element `tombstonedDots` field, so no trie leaf or root format changes. Receipts are still listed in writer order: an early remove reports `redundant`, because nothing live was removed at that point, and the later add reports `applied`. For this sequence, both reducers report these outcomes.

Inside one patch a remove can be checked against its owner, because the add that carries each dot is visible. A remove that lists an observed dot that the same patch adds to a different element is refused with `CrossOwnerRemoveError` (`E_PATCH_CROSS_OWNER_REMOVE`, a `PatchError`). The check runs when a `Patch` is built, so it covers the persisted-patch decode boundary and sync ingress. A dot carries no element (`writerId:counter`), so a dot that another patch added cannot be checked without state. For that malformed cross-patch shape the materialized state of both reducers deletes the element that holds the dot, while point reads through the session trie on Git storage (for example `hasNode`) still report it present. [#1120](https://github.com/git-stunts/git-warp/issues/1120) tracks this case. No git-warp writer produces it.

Rejected alternatives:

- Refuse every remove that lists no dots. A writer can lawfully remove an element that it sees as absent, and its patch must stay replayable. History that is readable now would become unreadable, and an empty-dot remove can never change membership, so refusal gives no safety.
- Keep the earlier reducer behavior, which skipped ownerless removes without validation or a receipt entry. That hides malformed input, and it disagrees with the decode boundary. Before the April 2026 op-class refactor, the same shape with dots deleted membership; after it, the shape was dropped without a sign.
- Log a warning for empty removes. Core has no logger port on this path, and the receipt already reports the no-op honestly.

The witnesses are in `test/unit/domain/services/JoinReducer.emptyRemoveLaw.test.ts` and `JoinReducer.emptyRemoveLaw.session.test.ts` (both reducers), `test/unit/domain/properties/RemoveReplayOrder.property.test.ts` (replay order on every reducer path), `test/unit/application/MaterializeReceiptsAgreement.test.ts` (Git storage), `test/unit/domain/types/SamePatchRemoveOwnership.test.ts` and `test/unit/domain/services/sync/SyncIngressRemoveLaw.test.ts`.

## Register identities

`LWWRegister` requires an actual validated `EventId` or the explicit historical checkpoint identity described below. A plain object with matching fields is not sufficient. The register is frozen and retains its admitted event and payload identity; payload deep freezing is not part of this constructor contract.

Modern `EventId` validation is unchanged: positive integer Lamport, non-empty writer identifier, lowercase hexadecimal patch identity of the admitted length, and non-negative integer operation index. Register join continues to compare Lamport, writer, patch identity and operation index in that order.

## Historical checkpoint compatibility

Supported unversioned and `full-v5` checkpoints may omit property event metadata, carry null metadata, or retain only an edge's numeric Lamport. The named checkpoint reader constructs a frozen `LegacyEventId` with the recorded non-negative integer Lamport, or zero when historical metadata is absent. Its writer remains empty, patch identity remains `0000`, and operation index remains zero, preserving the existing historical ordering without inventing a writer or timestamp.

Malformed explicit metadata is refused instead of being coerced into that legacy identity. Only plain or null-prototype transport records qualify; native CBOR dates, regular expressions, bytes and sets cannot turn into missing metadata when fields are parsed. Incorrect field types, invalid numeric values and incomplete modern identity fields do not acquire the missing-metadata compatibility allowance.

Current `full-v7` property and edge-birth identities cannot omit metadata or use a bare numeric edge birth. A checkpoint upgraded from a supported historical state may retain the complete explicit legacy tuple; the reader admits exactly that existing representation. Modern node lifecycle and edge removal records retain their separate strict decoder contract.

Both the CBOR full-state adapter and the legacy full-state boundary construct real `LWWRegister` and admitted event values. The checkpoint envelope reader applies the same identity rules. Supported checkpoint version names and serialized field representations remain unchanged.

Null or absent property registers retain their existing omission behavior. Other malformed register payloads, including primitives, are refused by both full-state readers rather than silently dropping stored properties.

Historical edge-birth and property identities remain explicit in state copies, joins, snapshots, scoped projections, session frames, comparisons, superseded outcomes and attachment lineage checks. Modern operation inputs retain strict `EventId` admission.

Historical property identities also survive checkpoint index capture, lifecycle shard encoding and bounded property reads. Only property register slots admit the complete legacy tuple; node births, clears, removals and patch-tail identities remain modern. The lifecycle shard schema and existing modern shard bytes remain unchanged.

## Encoding and witnesses

Encoding remains on `CodecPort` implementations and named wire boundaries; `ORSet` and `LWWRegister` have no serialization methods. `ORSetWireBoundary` turns transport collections into constructor-admitted membership state. The checkpoint readers validate transport metadata before core register behavior receives it, as required by the [Anti-Sludge decisions](../ANTI_SLUDGE_DECISIONS.md) and [Systems Style TypeScript](../SYSTEMS_STYLE_TYPESCRIPT.md).

Executable witnesses cover invalid constructor containers and identities, caller collection isolation, floating removals, real checkpoint hydration, malformed current and historical metadata, legacy upgrade and replay ordering, checkpoint envelope round trips, and historical register index capture through bounded tail reads. Existing deterministic join and replay suites continue to exercise valid multi-writer behavior. All executable validation runs in COPY-based Docker containers.
