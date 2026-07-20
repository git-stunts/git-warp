# Unmaterialized intents

Use unmaterialized intents when migration code needs to journal declarative machine-work claims without building imperative CRDT patches or executing whole-graph materialization. This compatibility path records descriptors in a retained intent journal; it does not apply their suffix transforms to canonical graph history.

An intent names the desired causal suffix transformation: a declared cryptographic nutrition label, a set of localized precommit guards, and a declarative effect payload. The compatibility API accepts a `WarpIntentDescriptor` carrying the Edict evaluation budget, profile facts, precommit guard obligations, and target suffix transform.

## The shipped path

```typescript
const receipt = await worldline.admitIntent({
  intentId: 'intent:xyph:quest:claim:001',
  nutritionLabel: {
    bundleHash: 'sha256:8f9a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a',
    coreHash: 'sha256:1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1b',
    profile: 'gitwarp.ref_crdt@1',
    budget: '1000',
  },
  precommitGuards: [
    { op: 'nodeStatus', nodeId: 'quest:abc', expected: 'READY', failureTag: 'QuestNotReady' },
    {
      op: 'nodeUnassignedOrSelf',
      nodeId: 'quest:abc',
      agentId: 'agent:alpha',
      failureTag: 'QuestAlreadyAssigned',
    },
  ],
  suffixTransform: {
    op: 'xyph.quest.claim',
    payload: { agentId: 'agent:alpha', timestamp: 1782604081333 },
  },
});

switch (receipt.outcome.kind) {
  case 'derived':
    console.log(receipt.publicationRef, receipt.retention);
    break;
  case 'obstruction':
    console.error(receipt.outcome.witness.reason);
    break;
}
```

`admitIntent()` captures one graph coordinate, then verifies every precommit guard through checkpoint-tail property optics pinned to that coordinate. It does not execute `PatchBuilder`, run `JoinReducer`, mix guard facts from different frontiers, or fall back to whole-graph materialization. It then publishes the descriptor through the git-cas-backed intent journal. A successful append returns a `derived` outcome with the exact pre-append journal basis, resulting journal frontier, publication identity, retention witness, and graph coordinate used to evaluate guarded law. A failed guard returns an `obstruction` with that evaluation coordinate, the observed fact, required fact, and exact read identity; it does not publish the descriptor. A missing checkpoint-tail basis or exhausted tail-read budget also returns a typed obstruction instead of materializing the graph.

This descriptor API is a retained compatibility journal, not a canonical application write. New application code that needs an admitted intent recorded in causal history must use `Timeline.write(intent)`. That path lowers the public intent into normal committed patch history and returns a write receipt.

## Cost posture

These labels describe current provider cost, not aspirational architecture.

| Surface                         | Current posture | What to rely on                                                                                                                                                  |
| ------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unmaterialized intent admission | Bounded         | One pinned coordinate supplies checkpoint-tail property optics for every guard. Missing basis or exhausted read budget obstructs admission.                      |
| Speculative descriptor queuing  | Bounded         | Each queued descriptor is retained in a separate git-cas-backed journal for the strand identity.                                                                 |
| Whole-state `JoinReducer` ticks | Diagnostic      | Imperative CRDT patch accumulation. Use for legacy compatibility or whole-graph diagnostic verification.                                                         |

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
        I2 -->|Evaluates Guards| I3[Checkpoint-Tail Property Optics]
        I3 -->|Returns| I4[Admission Outcome]
    end
```

`WarpIntentDescriptor` decouples intent from `Patch`. Precommit guards declare localized property expectations (`nodeStatus` and `nodeUnassignedOrSelf`) that the runtime evaluates without whole-graph materialization. Admission fails closed when the required checkpoint-tail evidence is unavailable or exceeds its bounded tail budget. Cost follows the configured bounded read provider; the API does not promise constant time independently of that provider.

## Nutrition labels and verifier reports

Edict calculates its cryptographic nutrition labels (`bundleHash`, `coreHash`) directly over canonical CBOR/JSON bytes (`edict.canonical-cbor/v1`).

For a locally authored compatibility descriptor, source and destination admission bases both name the exact pre-append intent-journal frontier. The descriptor bundle and core hashes bind the proposal and law/profile inputs; the resulting receipt binds the append to its post-publication frontier. The retained descriptor artifact remains outside canonical graph history.

Use `Timeline.write(intent)` when the requested transformation must become durable causal history. The timeline write path lowers the intent into a committed patch and keeps storage ownership behind the configured storage implementation.

## See also

- [Strands](strands.md)
- [Optic reads](optic-reads.md)
- [Continuum boundary](continuum-boundary.md)
- [Git substrate](git-substrate.md)
