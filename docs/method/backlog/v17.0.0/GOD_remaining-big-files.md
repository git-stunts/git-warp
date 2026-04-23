---
id: GOD_remaining-big-files
blocks:
  - API_migrate-consumers-to-capabilities
blocked_by:
  - CROSS_shared-provider-interfaces
feature: materialization-query-index
---

# Slay remaining big files (835–808 LOC)

## StreamingBitmapIndexBuilder (835 LOC)

Builds complete bitmap indexes from scratch (vs IncrementalIndexUpdater
which patches existing ones).

### Boundary violation

Same residue that remains after cycle `0056`: the "serialize phase" is
domain code encoding typed objects to `Uint8Array`. Serialization is
the port's job (SSTS P5).

### The fix

Uses the same `ShardPort` that already exists after the
`IncrementalIndexUpdater` split.
The builder constructs typed shard objects (`MetaShard`, `EdgeShard`,
`LabelMap`). The port adapter serializes them.

### Split: 2 files

`BitmapIndexBuilder.ts` (~500 LOC):
```typescript
class BitmapIndexBuilder {
  constructor(private readonly shards: ShardPort) {}

  build(state: WarpState): void
  // Walks state.nodeAlive, state.edgeAlive, state.prop.
  // Constructs MetaShard/EdgeShard/LabelMap objects.
  // Saves via this.shards.saveMeta(), saveEdgeShard(), saveLabels().

  // Private: buildNodeShards, buildEdgeShards, buildPropertyShards
}
```

The current "serialize" methods (`_serializeMeta`, `_serializeEdge`,
etc.) move into the `ShardPort` adapter — they ARE the adapter.

The serialize removal drops ~300 LOC, leaving ~500 LOC in the builder.
If the builder still exceeds 500 LOC after serialize extraction, split
into two files:
- `BitmapNodeBuilder.ts` — node + property shard construction
- `BitmapEdgeBuilder.ts` — edge shard construction + label map

`BitmapIndexBuilder.ts` becomes a thin orchestrator that delegates to
both builders. This is the concrete fallback, not a maybe.

---

## AuditVerifierService (824 LOC)

### Split: 2 files + 1 class

`AuditChainWalker.ts` (~300 LOC):
```typescript
class AuditChainWalker {
  constructor(
    private readonly persistence: CommitPort & BlobPort,
    private readonly codec: CodecPort,
  ) {}

  walkWriterChain(writerId: string, tipSha: string): AsyncGenerator<AuditRecord>
  collectAllRecords(frontier: Map<string, string>): Promise<AuditRecord[]>
}
```

`AuditVerifier.ts` (~400 LOC):
```typescript
class AuditVerifier {
  constructor(
    private readonly walker: AuditChainWalker,
    private readonly crypto: CryptoPort,
  ) {}

  verifyChain(frontier: Map<string, string>): Promise<TrustAssessment>
  verifyRecord(record: AuditRecord): Promise<RecordVerdict>
}
```

`TrustAssessment` class (~125 LOC, own file):
```typescript
class TrustAssessment {
  readonly verdict: 'trusted' | 'degraded' | 'untrusted';
  readonly violations: readonly TrustViolation[];
  readonly writerAssessments: ReadonlyMap<string, WriterAssessment>;

  constructor(params: { ... }) { Object.freeze(this); }

  isValid(): boolean { return this.verdict === 'trusted'; }
  trustLevel(): 'trusted' | 'degraded' | 'untrusted' { return this.verdict; }
  violationsFor(writerId: string): readonly TrustViolation[] { ... }
}
```

Behavior on the object. Consumers call `assessment.isValid()`, not
`assessment.verdict === 'trusted'`.

---

## VisibleStateComparisonV5 (808 LOC)

### Split: 2 files

`NodeEdgeDiff.ts` (~400 LOC):
```typescript
type NodeDiffResult = { readonly added: string[]; readonly removed: string[] };
type EdgeDiffResult = { readonly added: EdgeDiffEntry[]; readonly removed: EdgeDiffEntry[] };

function diffNodes(
  left: WarpState,
  right: WarpState,
): NodeDiffResult

function diffEdges(
  left: WarpState,
  right: WarpState,
): EdgeDiffResult

function aggregateStructuralDiff(
  nodeDiff: NodeDiffResult,
  edgeDiff: EdgeDiffResult,
): StructuralDiff
```

`PropertyDiff.ts` (~250 LOC):
```typescript
function diffProperties(
  left: WarpState,
  right: WarpState,
  targetId: string | null,
): PropertyDiffResult

type PropertyDiffResult = {
  changed: Array<{
    nodeId: string;
    key: string;
    leftValue: unknown;
    rightValue: unknown;
  }>;
  targetDiff: TargetPropertyDiff | null;
};
```

Orchestrator stays in existing `VisibleStateComparisonV5.ts` (~160 LOC):
```typescript
function compareVisibleStateV5(
  left: WarpState,
  right: WarpState,
  options: { targetId: string | null },
): VisibleStateDiff {
  const structural = aggregateStructuralDiff(diffNodes(...), diffEdges(...));
  const properties = diffProperties(left, right, options.targetId);
  return { structural, properties };
}
```

`StateDiff` stays a record — it's pure data, no behavior. Consumers
read fields, they don't dispatch on them.
