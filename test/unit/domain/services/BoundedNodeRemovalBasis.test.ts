import { expect, it, vi } from 'vitest';
import BoundedNodeRemovalBasis, { MAX_REMOVAL_BASIS_OPERATIONS, MAX_REMOVAL_BASIS_PATCHES, MAX_REMOVAL_BASIS_WRITERS, MAX_REMOVAL_BASIS_MEMBERS, MAX_REMOVAL_BASIS_TEXT_UNITS } from '../../../../src/domain/services/BoundedNodeRemovalBasis.ts';
import { PatchBuilder } from '../../../../src/domain/services/PatchBuilder.ts';
import NodeRemovalObservation from '../../../../src/domain/services/NodeRemovalObservation.ts';
import { readPatchBuilderCausalBasis } from '../../../../src/domain/services/admission/PatchBuilderCausalBasis.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import NodeAdd from '../../../../src/domain/types/ops/NodeAdd.ts';
import NodeRemove from '../../../../src/domain/types/ops/NodeRemove.ts';
import EdgeAdd from '../../../../src/domain/types/ops/EdgeAdd.ts';
import EdgeRemove from '../../../../src/domain/types/ops/EdgeRemove.ts';
import PropSet from '../../../../src/domain/types/ops/PropSet.ts';
import NodePropSet from '../../../../src/domain/types/ops/NodePropSet.ts';
import Patch from '../../../../src/domain/types/Patch.ts';
import type { PatchOp } from '../../../../src/domain/types/ops/unions.ts';
import PatchEntry from '../../../../src/domain/artifacts/PatchEntry.ts';
import WarpStream from '../../../../src/domain/stream/WarpStream.ts';
import nullLogger from '../../../../src/domain/utils/nullLogger.ts';
import { createPatchBuilderMockPersistence, RecordingPatchJournal } from './PatchBuilderTestHarness.ts';

const SHA = 'a'.repeat(40);
function entry(ops: readonly PatchOp[], lamport = 3): PatchEntry {
  return new PatchEntry({ sha: SHA, patch: new Patch({ schema: 2, writer: 'alice', lamport, context: { alice: 4 }, ops }) });
}
function fixture(entries: readonly PatchEntry[]) {
  const refs = createPatchBuilderMockPersistence();
  refs.listRefs.mockResolvedValue(['refs/warp/events/writers/alice']);
  refs.readRef.mockResolvedValue(SHA);
  const journal = new RecordingPatchJournal(refs);
  vi.spyOn(journal, 'scanPatchHistory').mockImplementation(() => WarpStream.from(entries));
  return { refs, journal, graphName: 'events', writerId: 'bob', expectedParentSha: null, targets: new Set(['n']) };
}
function builder(fields: ReturnType<typeof fixture>, overrides: Partial<ConstructorParameters<typeof PatchBuilder>[0]> = {}) {
  return new PatchBuilder({ persistence: fields.refs, patchJournal: fields.journal, graphName: 'events',
    writerId: 'bob', lamport: 1, versionVector: VersionVector.empty(), getCurrentState: () => null, ...overrides });
}

it('observes all live additions, respects removals, and captures incident edges without payload values', async () => {
  const fields = fixture([entry([
    new NodeAdd('n', new Dot('alice', 1)), new NodeAdd('unrelated', new Dot('alice', 2)),
    new NodeRemove('n', ['alice:1']), new NodeAdd('n', new Dot('alice', 3)),
    new EdgeAdd({ from: 'n', to: 'm', label: 'live', dot: new Dot('alice', 4) }),
    new EdgeAdd({ from: 'm', to: 'n', label: 'dead', dot: new Dot('alice', 5) }),
    new EdgeRemove({ from: 'm', to: 'n', label: 'dead', observedDots: ['alice:5'] }),
    new EdgeAdd({ from: 'x', to: 'y', label: 'other', dot: new Dot('alice', 6) }),
    new PropSet('n', 'k', 'payload'), new NodePropSet('n', 'j', 'another'), new PropSet('other', 'k', 'irrelevant'),
  ])]);
  const basis = await BoundedNodeRemovalBasis.capture(fields);
  expect(basis.containsNode('n')).toBe(true);
  expect(basis.containsNode('outside')).toBe(false);
  expect(basis.containsEdge('n', 'm', 'live')).toBe(true);
  expect(basis.containsEdge('m', 'n', 'dead')).toBe(false);
  expect(basis.containsEdge('x', 'y', 'other')).toBe(false);
  const observation = basis.node('n');
  expect(observation.operations('cascade', nullLogger)).toMatchObject([
    { type: 'EdgeRemove', observedDots: ['alice:4'] }, { type: 'NodeRemove', observedDots: ['alice:3'] },
  ]);
  expect(() => observation.operations('reject', nullLogger)).toThrow(expect.objectContaining({ code: 'E_PATCH_DELETE_WITH_DATA' }));
  expect(observation.operations('warn', nullLogger)).toHaveLength(1);
  expect(basis.context().get('alice')).toBe(6);
  expect(basis.lamport).toBe(3);
  expect(() => basis.node('outside')).toThrow();
});

it('binds the captured coordinate, causal context and Lamport before lowering a removal', async () => {
  const fields = fixture([entry([new NodeAdd('n', new Dot('alice', 1))])]);
  const patch = builder(fields);
  await patch.prepareWriteBasis(['n']);
  patch.removeNode('n');
  expect(patch.build()).toMatchObject({ lamport: 4, context: { alice: 4 }, reads: ['n'] });
  expect(readPatchBuilderCausalBasis(patch).evaluationCoordinateRef).toContain(SHA);
  expect(patch.build().ops).toMatchObject([{ type: 'NodeRemove', observedDots: ['alice:1'] }]);
});

it('does not fabricate a membership observation for an absent target', async () => {
  const fields = fixture([]);
  const patch = builder(fields);
  await patch.prepareWriteBasis(['n']);
  expect(() => patch.removeNode('n')).toThrow(expect.objectContaining({ code: 'E_PATCH_ENTITY_NOT_FOUND' }));
  expect(patch.ops).toHaveLength(0);
});

it('restores a reopened writer counter from its persisted parent', async () => {
  const fields = fixture([entry([])]);
  const patch = builder(fields, { writerId: 'alice', expectedParentSha: SHA });
  await patch.prepareWriteBasis([]);
  patch.addNode('new');
  expect(patch.build().ops).toMatchObject([{ dot: { writerId: 'alice', counter: 5 } }]);
});

it('refuses missing parent evidence and preparations after lowering', async () => {
  const fields = fixture([]);
  await expect(builder(fields, { expectedParentSha: SHA }).prepareWriteBasis([])).rejects.toThrow();
  const patch = builder(fields);
  patch.addNode('n');
  await expect(patch.prepareWriteBasis(['n'])).rejects.toThrow();
  await expect(builder(fields, { targetRefPath: 'refs/warp/events/strands/s' }).prepareWriteBasis(['n'])).rejects.toThrow();
});

it.each(['writers', 'patches', 'operations'])('refuses an oversized %s observation', async (bound) => {
  const fields = fixture(bound === 'patches'
    ? Array.from({ length: MAX_REMOVAL_BASIS_PATCHES + 1 }, () => entry([]))
    : [entry(Array.from({ length: bound === 'operations' ? MAX_REMOVAL_BASIS_OPERATIONS + 1 : 1 }, () => new NodeAdd('n', new Dot('alice', 1))))]);
  if (bound === 'writers') fields.refs.listRefs.mockResolvedValue(Array.from({ length: MAX_REMOVAL_BASIS_WRITERS + 1 }, (_, i) => `refs/warp/events/writers/w${i}`));
  const patch = builder(fields);
  await expect(patch.prepareWriteBasis(['n'])).rejects.toThrow(expect.objectContaining({ code: 'E_PATCH_NO_STATE' }));
  expect(patch.ops).toHaveLength(0);
});

it('rejects invalid removal observations', () => {
  expect(() => new NodeRemovalObservation(new NodeRemove('n', []), [], -1)).toThrow();
  expect(() => new NodeRemovalObservation(new NodeRemove('n', []), [new EdgeRemove({ from: 'a', to: 'b', label: 'x', observedDots: [] })], 0)).toThrow();
});

it('keeps an addition outside the captured frontier concurrent with the removal', async () => {
  const fields = fixture([entry([new NodeAdd('n', new Dot('alice', 1))])]);
  const patch = builder(fields);
  await patch.prepareWriteBasis(['n']);
  // A foreign writer now publishes another addition; the captured observation is immutable.
  fields.refs.listRefs.mockResolvedValue(['refs/warp/events/writers/alice', 'refs/warp/events/writers/carol']);
  patch.removeNode('n');
  expect(patch.build().ops).toMatchObject([{ type: 'NodeRemove', observedDots: ['alice:1'] }]);
});

it('bounds removal-dot payloads and retained text independently of operation count', async () => {
  for (const op of [
    new NodeRemove('n', Array.from({ length: MAX_REMOVAL_BASIS_MEMBERS + 1 }, (_, i) => `alice:${i + 1}`)),
    new PropSet('n', 'x'.repeat(MAX_REMOVAL_BASIS_TEXT_UNITS + 1), 'ignored-value'),
  ]) {
    await expect(BoundedNodeRemovalBasis.capture(fixture([entry([op])]))).rejects.toThrow();
  }
});

it('uses its own immutable parent and observes reverse incident edges', async () => {
  const fields = fixture([new PatchEntry({ sha: SHA, patch: new Patch({ schema: 2, writer: 'alice', lamport: 1, context: {}, ops: [
    new NodeAdd('n', new Dot('alice', 1)), new EdgeAdd({ from: 'm', to: 'n', label: 'in', dot: new Dot('alice', 2) }),
  ] }) })]);
  const basis = await BoundedNodeRemovalBasis.capture({ ...fields, writerId: 'alice', expectedParentSha: SHA });
  expect(basis.node('n').operations('cascade', nullLogger)).toMatchObject([
    { type: 'EdgeRemove', from: 'm', to: 'n' }, { type: 'NodeRemove', observedDots: ['alice:1'] },
  ]);
  fields.refs.readRef.mockResolvedValue(null);
  const empty = await BoundedNodeRemovalBasis.capture(fields);
  expect(() => empty.node('n').operations('warn', nullLogger)).toThrow();
});

it('refuses mutation during asynchronous membership capture', async () => {
  const fields = fixture([entry([new NodeAdd('n', new Dot('alice', 1))])]);
  const patch = builder(fields);
  fields.refs.listRefs.mockImplementation(async () => {
    patch.addNode('racing');
    return ['refs/warp/events/writers/alice'];
  });
  await expect(patch.prepareWriteBasis(['n'])).rejects.toThrow();
});

it('keeps effect publication and content access on the builder unchanged', () => {
  const patch = builder(fixture([]));
  expect(patch.emitEffect('log')).toContain('effect:');
  expect(patch.emitEffect('log', { message: 'x' }, { effectId: 'effect:explicit' })).toBe('effect:explicit');
  expect(patch.contentAssets).toEqual([]);
  // @ts-expect-error malformed origin at the runtime boundary
  expect(() => patch.addRetainedEntity('bad', {}, null)).toThrow();
  patch.ops.push(new PropSet('effect:explicit', 'raw', 'legacy'));
  expect(patch.build().ops.at(-1)).toBeInstanceOf(PropSet);
});
