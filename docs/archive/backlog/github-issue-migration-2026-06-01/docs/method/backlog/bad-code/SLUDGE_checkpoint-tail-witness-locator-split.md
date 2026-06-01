---
blocked_by: []
blocks: []
id: BAD_CheckpointTailWitnessLocator-split
file: src/domain/services/optic/CheckpointTailWitnessLocator.ts
feature: v17-optics-checkpoint-tail
release_home: v17.0.0
---

# Split CheckpointTailWitnessLocator before it becomes sludge

## Symptom

`src/domain/services/optic/CheckpointTailWitnessLocator.ts` landed in
the 0113 GREEN slice as the first real bounded optic read path. It is
not fake architecture: it loads a checkpoint/index basis, scans the live
suffix across discovered writers, filters by entity/aspect, fails
closed, and returns an honest `readIdentity`.

The file is also 481 lines. That is under the 500 LOC source limit, but
close enough to be an immediate sludge risk if the next optics slice adds
more behavior here.

## Why it matters

`CheckpointTailWitnessLocator` currently owns several separable jobs:

- loading the latest usable checkpoint/index basis
- resolving checkpoint payload pointers
- reading targeted node/property checkpoint shard payloads
- scanning all writer suffixes after the checkpoint frontier
- reducing node liveness from checkpoint reading plus tail witnesses
- reducing property values from checkpoint reading plus tail witnesses
- building `ReadIdentity`
- translating unsupported cases into fail-closed optic errors

Those responsibilities are correct for the first foundation slice, but
they should not keep accumulating in one class. The next implementation
cycle should be able to extend optics without making this file the
unreviewable center of gravity.

## Proposed fix

Split the locator into runtime-backed concepts with narrow ownership:

1. `CheckpointTailBasisLoader`
   - Finds the checkpoint ref.
   - Decodes the checkpoint message.
   - Requires schema 4/index-tree basis.
   - Loads frontier and shard OID maps.
   - Fails closed when no bounded basis exists.

2. `CheckpointShardFactReader`
   - Reads only the requested entity/aspect shard payload.
   - Owns `meta_${computeShardKey(nodeId)}.cbor` and
     `props_${computeShardKey(nodeId)}.cbor` lookup.
   - Keeps checkpoint shard loading targeted and inspectable.

3. `CheckpointTailFactReducer`
   - Reduces checkpoint readings plus tail witnesses.
   - Keeps node liveness and property projection laws explicit.
   - Preserves the current fail-closed behavior for unsupported tail
     cases until richer witness support exists.

4. `CheckpointTailReadIdentityBuilder`
   - Names checkpoint basis and tail witnesses separately.
   - Keeps `readIdentity` construction out of the locator.

Leave `CheckpointTailWitnessLocator` as the small orchestration surface
used by `WorldlineOptic`, `NodeOptic`, and `NodePropertyOptic`.

## Non-goals

- Do not change public optic behavior.
- Do not add the full Roaring/CAS cache system.
- Do not implement recursive WARP optics.
- Do not add Continuum protocol behavior.
- Do not weaken fail-closed behavior.
- Do not reintroduce `_materializeGraph()` as a fallback.

## Acceptance

- `CheckpointTailWitnessLocator.ts` is comfortably below the source LOC
  limit after the split.
- Each extracted concept has a single reason to change.
- Existing 0113 conformance tests still pass.
- New tests cover any extracted fail-closed behavior that becomes easier
  to test directly.
- No public optic path calls `_materializeGraph()`, `materialize()`,
  `_loadLatestCheckpoint()`, or `state.cbor`.
- `readIdentity` still names checkpoint basis and tail witnesses
  separately.

## Related

- Commit `a10a8533` introduced the v17 checkpoint-tail optic read basis.
- `docs/design/0113-v17-checkpoint-tail-optic-read-basis.md` documents
  the current foundation slice.
