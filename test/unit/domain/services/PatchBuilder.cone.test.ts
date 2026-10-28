import { describe, expect, it, vi } from 'vitest';
import PatchEntry from '../../../../src/domain/artifacts/PatchEntry.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import DotMint from '../../../../src/domain/crdt/DotMint.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import ConeObstructedError from '../../../../src/domain/errors/ConeObstructedError.ts';
import ConeLaneBasis from '../../../../src/domain/services/cone/ConeLaneBasis.ts';
import ConeWriteBasis from '../../../../src/domain/services/cone/ConeWriteBasis.ts';
import ConeWriteTargets from '../../../../src/domain/services/cone/ConeWriteTargets.ts';
import { PatchBuilder } from '../../../../src/domain/services/PatchBuilder.ts';
import WarpState from '../../../../src/domain/services/state/WarpState.ts';
import WarpStream from '../../../../src/domain/stream/WarpStream.ts';
import EdgeAdd from '../../../../src/domain/types/ops/EdgeAdd.ts';
import NodeAdd from '../../../../src/domain/types/ops/NodeAdd.ts';
import InMemoryConeRecordStore from '../../../helpers/InMemoryConeRecordStore.ts';
import MemoryConeFeed from '../../../helpers/MemoryConeFeed.ts';
import { createPatchBuilderMockPersistence, RecordingPatchJournal } from './PatchBuilderTestHarness.ts';

const LANE = 'events';
const EDGE = Object.freeze({ from: 'n', to: 'm', label: 'rel' });

/** A lane whose writer `alice` added n, m and n->m; a builder for writer `bob` over it. */
function fixture(state: WarpState | null = null) {
  const feed = new MemoryConeFeed(LANE);
  const head = feed.append('alice', [
    new NodeAdd('n', new Dot('alice', 1)), new NodeAdd('m', new Dot('alice', 2)), new EdgeAdd({ ...EDGE, dot: new Dot('alice', 3) }),
  ]);
  const cone = ConeLaneBasis.ofLane({ store: new InMemoryConeRecordStore(), feed, lane: LANE });
  const refs = createPatchBuilderMockPersistence();
  refs.listRefs.mockResolvedValue(['refs/warp/events/writers/alice']);
  refs.readRef.mockResolvedValue(head.sha);
  const journal = new RecordingPatchJournal(refs);
  vi.spyOn(journal, 'scanPatchHistory').mockImplementation((_writer, sha) => WarpStream.from(
    feed.chains.get('alice')?.filter((entry: PatchEntry) => entry.sha === sha) ?? [],
  ));
  const patch = new PatchBuilder({
    persistence: refs, patchJournal: journal, graphName: LANE, writerId: 'bob', lamport: 1,
    versionVector: VersionVector.empty(), dotMint: DotMint.after('bob', 0), getCurrentState: () => state,
  });
  return { feed, cone, patch, head };
}

function targets(nodes: readonly string[], edges: ConstructorParameters<typeof ConeWriteTargets>[0]['edges'] = []): ConeWriteTargets {
  return new ConeWriteTargets({ nodes, edges });
}

describe('PatchBuilder.prepareConeWriteBasis', () => {
  it('observes the writer heads without advancing the cone for a blind write', async () => {
    const { feed, cone, patch } = fixture();
    await patch.prepareConeWriteBasis(targets([]), cone);
    expect(feed.ranges).toEqual([]);
    patch.addNode('x');
    expect(patch.build().observedFrontier?.heads.map((head) => head.writerId)).toEqual(['alice']);
  });

  it('removes nodes and edges with the live dots of their cone records', async () => {
    const { cone, patch, head } = fixture();
    await patch.prepareConeWriteBasis(targets(['n'], [EDGE]), cone);
    patch.removeEdge(EDGE.from, EDGE.to, EDGE.label).removeNode('n');
    const built = patch.build();
    expect(built.ops).toMatchObject([
      { type: 'EdgeRemove', ...EDGE, observedDots: ['alice:3'] },
      { type: 'NodeRemove', node: 'n', observedDots: ['alice:1'] },
    ]);
    expect(built.observedFrontier?.heads).toMatchObject([{ writerId: 'alice', patchSha: head.sha }]);
    expect(built.lamport).toBe(2);
    expect(() => patch.removeEdge('m', 'n', 'rel')).toThrow(expect.objectContaining({ code: 'E_PATCH_NO_STATE' }));
  });

  it('checks content owners against cone records before process-resident state', async () => {
    const stale = WarpState.empty();
    const { cone, patch } = fixture(stale);
    await patch.prepareConeWriteBasis(targets(['n', 'gone'], [EDGE]), cone);
    expect(() => patch.clearContent('n')).not.toThrow();
    expect(() => patch.clearEdgeContent(EDGE.from, EDGE.to, EDGE.label)).not.toThrow();
    expect(() => patch.clearContent('gone')).toThrow(expect.objectContaining({ code: 'E_PATCH_CONTENT_UNKNOWN_NODE' }));
    expect(() => patch.clearEdgeContent('m', 'n', 'rel')).toThrow(expect.objectContaining({ code: 'E_PATCH_EDGE_PROP_UNKNOWN_EDGE' }));
  });

  it('refuses an obstructed lane, prior operations and mutation during capture', async () => {
    const obstructed = fixture();
    obstructed.feed.diverged.add('alice');
    await expect(obstructed.patch.prepareConeWriteBasis(targets(['n']), obstructed.cone)).rejects.toBeInstanceOf(ConeObstructedError);

    const lowered = fixture();
    lowered.patch.addNode('early');
    await expect(lowered.patch.prepareConeWriteBasis(targets(['n']), lowered.cone))
      .rejects.toThrow(expect.objectContaining({ code: 'E_WRITE_INTENT_PUBLICATION' }));

    const racing = fixture();
    const capture = ConeWriteBasis.capture.bind(ConeWriteBasis);
    vi.spyOn(ConeWriteBasis, 'capture').mockImplementationOnce(async (fields) => {
      racing.patch.addNode('racing');
      return await capture(fields);
    });
    await expect(racing.patch.prepareConeWriteBasis(targets(['n']), racing.cone))
      .rejects.toThrow(expect.objectContaining({ code: 'E_PATCH_NO_STATE' }));
  });

  it('still removes an edge through materialized state when no cone basis was prepared', () => {
    const state = WarpState.empty();
    state.edgeAlive.add('n\0m\0rel', new Dot('alice', 3));
    const { patch } = fixture(state);
    patch.removeEdge(EDGE.from, EDGE.to, EDGE.label);
    expect(patch.build().ops).toMatchObject([{ type: 'EdgeRemove', observedDots: ['alice:3'] }]);
    const { patch: stateless } = fixture();
    expect(() => stateless.removeEdge(EDGE.from, EDGE.to, EDGE.label)).toThrow(expect.objectContaining({ code: 'E_PATCH_NO_STATE' }));
  });
});
