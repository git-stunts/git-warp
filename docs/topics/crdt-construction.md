# CRDT construction and checkpoint admission

This page describes the current source's internal CRDT admission contract. It does not add constructors to the supported Runtime package surface. The change tracked by [#189](https://github.com/git-stunts/git-warp/issues/189) validates construction and persistence hydration; membership retirement and garbage collection remain separate operations.

## Membership collections

`ORSet` requires a `Map` from string elements to `Set` collections of canonical encoded dots, plus a `Set` of canonical tombstones. Every dot passes the existing `Dot` admission rules. Non-string elements, non-Set collections and malformed identity keys fail during construction.

Construction copies the outer map, every nested dot set and the tombstone set. Later mutation of caller-owned collections cannot change the constructed value. The admitted ORSet remains mutable during reduction; this contract does not freeze its working storage or change add, remove, join and compaction behavior.

Empty string elements and empty dot collections remain admissible. Floating tombstones remain valid even when their additions have not arrived. A later matching add stays removed; constructor validation must not discard that causal evidence.

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
