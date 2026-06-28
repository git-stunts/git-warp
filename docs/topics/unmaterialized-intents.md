# Unmaterialized intents

Use unmaterialized intents when you want to admit declarative, verified machine work claims directly onto a causal worldline or speculative strand without building imperative CRDT patches or executing whole-graph materialization.

An intent names the desired causal suffix transformation: a cryptographic nutrition label, a set of localized precommit guards, and a declarative effect payload. The runtime turns that intent into a frozen `WarpIntentDescriptor` value before admission. That value carries the Edict evaluation budget, profile facts, precommit guard obligations, and the target suffix transform.

## The shipped path

```typescript
const outcome = await worldline.admitIntent({
  intentId: 'intent:xyph:quest:claim:001',
  nutritionLabel: {
    bundleHash: 'sha256:8f9a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a',
    coreHash: 'sha256:1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1b',
    profile: 'gitwarp.ref_crdt@1',
    budget: '1000',
  },
  precommitGuards: [
    { op: 'nodeStatus', nodeId: 'quest:abc', expected: 'READY', failureTag: 'QuestNotReady' },
    { op: 'nodeUnassignedOrSelf', nodeId: 'quest:abc', agentId: 'agent:alpha', failureTag: 'QuestAlreadyAssigned' },
  ],
  suffixTransform: {
    op: 'xyph.quest.claim',
    payload: { agentId: 'agent:alpha', timestamp: 1782604081333 },
  },
});
```

`admitIntent()` verifies the precommit guards directly against `WarpWorldlineOpticBasis`. It does not execute `PatchBuilder` or run `JoinReducer` to materialize the whole graph. If a precommit guard fails, the admission fails closed with `admitted: false` and returns the typed obstruction tag (e.g., `QuestNotReady`).

## Cost posture

These labels describe current provider cost, not aspirational architecture.

| Surface | Current posture | What to rely on |
| --- | --- | --- |
| Unmaterialized intent admission | Bounded | Precommit guards verify localized properties via `SeekCachePort` without graph-wide materialization. |
| Speculative strand intent queuing | Bounded | Intents accumulate in-memory on the strand descriptor with zero Git object allocation until tick admission. |
| Whole-state `JoinReducer` ticks | Diagnostic | Imperative CRDT patch accumulation. Use for legacy compatibility or whole-graph diagnostic verification. |

Do not write docs or product code that implies every mutation must materialize the graph. `admitIntent()` provides the strongest shipped bounded evidence for lawful machine work.

## Precommit guards versus CRDT patches

Legacy `queueStrandIntent` and `StrandIntentDescriptor` were tightly coupled to `patch: Patch`. This forced the runtime to maintain an imperative log of CRDT operations (`addNode`, `setProperty`, `addEdge`) and execute `JoinReducer` during strand ticks.

```mermaid
flowchart TD
    subgraph LegacyImperative [Legacy Imperative Strand Tick]
        P1[queueStrandIntent] -->|Enqueues| P2[patch: Patch]
        P2 -->|Forces Join| P3[JoinReducer Materialization]
        P3 -->|Serializes CRDT| P4[refs/warp/.../writers]
    end

    subgraph DeclarativeAdmission [Declarative Intent Admission]
        I1[worldline.admitIntent] -->|Passes| I2[WarpIntentDescriptor]
        I2 -->|Evaluates Guards| I3[WarpWorldlineOpticBasis / SeekCachePort]
        I3 -->|Unmaterialized Append| I4[GitWarpWitnessedSuffixAdmissionShell]
        I4 -->|Direct Write| P4
    end
```

`WarpIntentDescriptor` decouples intent from `Patch`. Precommit guards declare localized property expectations (`nodeStatus`, `edgeExists`) that the runtime evaluates in constant time $O(1)$.

## Nutrition labels and verifier reports

Edict calculates its cryptographic nutrition labels (`bundleHash`, `coreHash`) directly over canonical CBOR/JSON bytes (`edict.canonical-cbor/v1`). 

When an intent passes its precommit guards, the runtime encapsulates `WarpIntentDescriptor` into a `GitWarpWitnessedSuffixAdmissionShell`. It serializes this deterministic document directly into `refs/warp/<graph>/writers/<writerId>`. By retaining canonical CBOR/JSON, `git-warp` preserves verifier proofs with zero serialization overhead and avoids the rigid 32-bit limits of Wesley LE-binary (`lr_raw`).

## See also

- [Strands](strands.md)
- [Optic reads](optic-reads.md)
- [Continuum boundary](continuum-boundary.md)
- [Git substrate](git-substrate.md)
