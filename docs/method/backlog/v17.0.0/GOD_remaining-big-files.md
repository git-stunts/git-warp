# Slay remaining big files (835–808 LOC)

## StreamingBitmapIndexBuilder (835 LOC)

Builds complete bitmap indexes from scratch (vs IncrementalIndexUpdater
which patches existing ones).

### Boundary violation

Same as IncrementalIndexUpdater: the "serialize phase" is domain code
encoding typed objects to `Uint8Array`. Serialization is the port's
job (SSTS P5).

### The fix

Uses the same `ShardPort` from the IncrementalIndexUpdater split.
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

If the builder exceeds 500 LOC after removing serialize logic, split
further:
- `BitmapNodeBuilder.ts` — node shard construction
- `BitmapEdgeBuilder.ts` — edge shard construction

But the serialize removal alone should drop ~300 LOC.

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
function diffNodes(
  left: WarpState,
  right: WarpState,
): { added: string[]; removed: string[] }

function diffEdges(
  left: WarpState,
  right: WarpState,
): { added: EdgeDiffEntry[]; removed: EdgeDiffEntry[] }

function aggregateStructuralDiff(
  nodeDiff: { added: string[]; removed: string[] },
  edgeDiff: { added: EdgeDiffEntry[]; removed: EdgeDiffEntry[] },
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
