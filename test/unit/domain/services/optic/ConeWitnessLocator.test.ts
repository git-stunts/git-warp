import { describe, expect, it } from 'vitest';
import ContinuumEvidencePosture from '../../../../../src/domain/continuum/ContinuumEvidencePosture.ts';
import { Dot } from '../../../../../src/domain/crdt/Dot.ts';
import ConeBasis from '../../../../../src/domain/services/cone/ConeBasis.ts';
import ConeLaneBasis from '../../../../../src/domain/services/cone/ConeLaneBasis.ts';
import ConeRecordKey from '../../../../../src/domain/services/cone/ConeRecordKey.ts';
import LiveConeReadBasis from '../../../../../src/domain/services/cone/LiveConeReadBasis.ts';
import PinnedConeReadBasis from '../../../../../src/domain/services/cone/PinnedConeReadBasis.ts';
import ConeNeighborhoodCursor from '../../../../../src/domain/services/optic/ConeNeighborhoodCursor.ts';
import ConeReadIdentity from '../../../../../src/domain/services/optic/ConeReadIdentity.ts';
import ConeWitnessLocator from '../../../../../src/domain/services/optic/ConeWitnessLocator.ts';
import Optic from '../../../../../src/domain/services/optic/Optic.ts';
import OpticAperturePosture from '../../../../../src/domain/services/optic/OpticAperturePosture.ts';
import OpticBasisPosture from '../../../../../src/domain/services/optic/OpticBasisPosture.ts';
import OpticCoordinatePosture from '../../../../../src/domain/services/optic/OpticCoordinatePosture.ts';
import OpticSupportRule from '../../../../../src/domain/services/optic/OpticSupportRule.ts';
import TraversalOptic from '../../../../../src/domain/services/optic/TraversalOptic.ts';
import WorldlineOptic from '../../../../../src/domain/services/optic/WorldlineOptic.ts';
import EdgeAdd from '../../../../../src/domain/types/ops/EdgeAdd.ts';
import EdgeRemove from '../../../../../src/domain/types/ops/EdgeRemove.ts';
import NodeAdd from '../../../../../src/domain/types/ops/NodeAdd.ts';
import NodePropSet from '../../../../../src/domain/types/ops/NodePropSet.ts';
import NodeRemove from '../../../../../src/domain/types/ops/NodeRemove.ts';
import InMemoryConeRecordStore from '../../../../helpers/InMemoryConeRecordStore.ts';
import MemoryConeFeed from '../../../../helpers/MemoryConeFeed.ts';

const LANE = 'events';

/** hub -has-> a, b (b removed), c; d -has-> hub; hub -tag-> a; edge hub->c removed. */
async function graph() {
  const store = new InMemoryConeRecordStore();
  const feed = new MemoryConeFeed(LANE);
  let counter = 0;
  const dot = () => new Dot('w1', (counter += 1));
  feed.append('w1', [
    ...['hub', 'a', 'b', 'c', 'd', 'gone'].map((id) => new NodeAdd(id, dot())),
    new EdgeAdd({ from: 'hub', to: 'a', label: 'has', dot: dot() }),
    new EdgeAdd({ from: 'hub', to: 'b', label: 'has', dot: dot() }),
    new EdgeAdd({ from: 'hub', to: 'c', label: 'has', dot: dot() }),
    new EdgeAdd({ from: 'd', to: 'hub', label: 'has', dot: dot() }),
    new EdgeAdd({ from: 'hub', to: 'a', label: 'tag', dot: dot() }),
    new NodePropSet('hub', 'title', 'Hub'),
    new NodePropSet('gone', 'title', 'Old'),
  ]);
  feed.append('w1', [
    new NodeRemove('b', ['w1:3']),
    new EdgeRemove({ from: 'hub', to: 'c', label: 'has', observedDots: ['w1:9'] }),
    new NodeRemove('gone', ['w1:6']),
  ]);
  feed.append('w1', [new NodeAdd('gone', new Dot('w1', 20))]);
  const cone = ConeLaneBasis.ofLane({ store, feed, lane: LANE });
  return { cone, feed, optic: new WorldlineOptic({ worldline: LANE, cone: new LiveConeReadBasis(cone), coordinatePosture: OpticCoordinatePosture.liveOneOff() }) };
}

const POSTURE = Object.freeze({
  coordinatePosture: OpticCoordinatePosture.liveOneOff(),
  aperturePosture: OpticAperturePosture.defaultFullRead(),
  basisPosture: OpticBasisPosture.coneBasis(),
  evidencePosture: ContinuumEvidencePosture.translatedGitWarpEvidence(),
});

describe('ConeWitnessLocator node and property reads', () => {
  it('answers liveness and visible property values with cone read identities', async () => {
    const { optic } = await graph();
    const hub = await optic.node('hub').read();
    expect(hub.alive).toBe(true);
    expect(hub.readIdentity).toBeInstanceOf(ConeReadIdentity);
    expect(hub.readIdentity).toMatchObject({
      kind: 'cone-read', basis: 'coneRecordBasis', worldline: LANE, entityAspect: 'node:hub:liveness',
      coneRecords: [ConeRecordKey.forNode('hub').toString()],
    });
    expect((await optic.node('b').read()).alive).toBe(false);
    expect((await optic.node('hub').prop('title').read()).value).toBe('Hub');
    expect((await optic.node('hub').prop('missing').read()).exists).toBe(false);
    expect((await optic.node('b').prop('title').read()).exists).toBe(false);
    // `gone` was removed (clearing its registers) and re-added: the old title stays cleared.
    expect((await optic.node('gone').read()).alive).toBe(true);
    expect((await optic.node('gone').prop('title').read()).exists).toBe(false);
  });

  it('pins a captured basis: later folds are invisible to it', async () => {
    const { cone, feed } = await graph();
    const basis = await cone.advance();
    if (!(basis instanceof ConeBasis)) { throw new Error('expected a basis'); }
    const pinned = new WorldlineOptic({ worldline: LANE, cone: new PinnedConeReadBasis(cone, basis), coordinatePosture: OpticCoordinatePosture.capturedCoordinate() });
    feed.append('w1', [new NodePropSet('hub', 'title', 'Later')]);
    const read = await pinned.node('hub').prop('title').read();
    expect(read.value).toBe('Hub');
    expect(read.readIdentity).toMatchObject({ coneRoot: basis.root.toString(), coneFrontier: [{ writerId: 'w1', lamport: 3 }] });
  });

  it('refuses an optic of another kind', async () => {
    const { cone } = await graph();
    const locator = new ConeWitnessLocator({ worldline: LANE, source: new LiveConeReadBasis(cone) });
    const neighborhood = Optic.neighborhood({ ...POSTURE, nodeId: 'hub' });
    await expect(locator.readNode(neighborhood)).rejects.toMatchObject({ code: 'E_OPTIC_SCHEMA' });
    await expect(locator.readNodeProperty(neighborhood)).rejects.toMatchObject({ code: 'E_OPTIC_SCHEMA' });
    await expect(locator.readNeighborhood(Optic.node({ ...POSTURE, nodeId: 'hub' }), {})).rejects.toMatchObject({ code: 'E_OPTIC_SCHEMA' });
    await expect(locator.readTraversal(neighborhood, {})).rejects.toMatchObject({ code: 'E_OPTIC_SCHEMA' });
  });
});

describe('ConeWitnessLocator neighbourhood reads', () => {
  it('lists visible incident edges canonically, by direction and label', async () => {
    const { optic } = await graph();
    expect((await optic.neighborhood('hub').read()).edges).toEqual([
      { direction: 'out', neighborId: 'a', label: 'has' }, { direction: 'out', neighborId: 'a', label: 'tag' },
    ]);
    expect((await optic.neighborhood('hub').read({ direction: 'in' })).edges).toEqual([{ direction: 'in', neighborId: 'd', label: 'has' }]);
    const both = await optic.neighborhood('hub').read({ direction: 'both', labels: ['has'] });
    expect(both.edges).toEqual([{ direction: 'in', neighborId: 'd', label: 'has' }, { direction: 'out', neighborId: 'a', label: 'has' }]);
    expect(both.completeness).toBe('complete');
    expect(both.readIdentity).toMatchObject({ entityAspect: 'node:hub:neighborhood:both:labels:3:has' });
    expect((await optic.neighborhood('b').read({ direction: 'in' })).edges).toEqual([]);
  });

  it('pages after a cursor and refuses a cursor of another reading', async () => {
    const { optic } = await graph();
    const first = await optic.neighborhood('hub').read({ direction: 'both', limit: 2 });
    expect(first.edges.map((edge) => edge.neighborId)).toEqual(['d', 'a']);
    expect(first.completeness).toBe('truncated');
    const cursor = first.cursor ?? '';
    const rest = await optic.neighborhood('hub').read({ direction: 'both', limit: 2, cursor });
    expect(rest.edges).toEqual([{ direction: 'out', neighborId: 'a', label: 'tag' }]);
    expect(rest.cursor).toBeNull();
    for (const invalid of [
      'not-a-cursor', cursor.replace('|both|', '|out|'), `${cursor}|extra`,
      new ConeNeighborhoodCursor({ direction: 'out', neighborId: 'a', label: 'has' }).encode({ nodeId: 'hub', direction: 'both', labels: [] }).replace('|out|a|', '|sideways|a|'),
      new ConeNeighborhoodCursor({ direction: 'out', neighborId: 'a', label: 'has' }).encode({ nodeId: 'hub', direction: 'both', labels: [] }).replace('|a|has', '|%E0|has'),
    ]) {
      await expect(optic.neighborhood('hub').read({ direction: 'both', cursor: invalid })).rejects.toMatchObject({ code: 'E_OPTIC_NEIGHBORHOOD_OPTIONS' });
    }
    await expect(optic.neighborhood('hub').read({ direction: 'both', labels: ['has'], cursor })).rejects.toMatchObject({ code: 'E_OPTIC_NEIGHBORHOOD_OPTIONS' });
    await expect(optic.neighborhood('hub').read({ limit: 0 })).rejects.toMatchObject({ code: 'E_OPTIC_NEIGHBORHOOD_OPTIONS' });
    // @ts-expect-error exercising runtime validation for JavaScript callers
    await expect(optic.neighborhood('hub').read({ direction: 'sideways' })).rejects.toMatchObject({ code: 'E_OPTIC_NEIGHBORHOOD_OPTIONS' });
    expect((await optic.neighborhood('hub').read({ cursor: '' })).edges).toHaveLength(2);
  });

  it('traverses one pinned basis under explicit limits and refuses unbounded discovery', async () => {
    const { optic } = await graph();
    const walk = await optic.traversal('d').read({ maxDepth: 2, maxNodes: 10, maxEdges: 10 });
    expect(walk.visitedNodeIds).toEqual(['a', 'd', 'hub']);
    expect(walk.readIdentities.every((identity) => identity instanceof ConeReadIdentity)).toBe(true);
    await expect(optic.traversal('d').read()).rejects.toMatchObject({ code: 'E_OPTIC_TRAVERSAL_UNBOUNDED' });
  });
});

describe('TraversalOptic', () => {
  it('requires a witness locator', () => {
    const optic = Optic.traversal({ ...POSTURE, startNodeId: 'hub', supportRule: OpticSupportRule.globalDiscoveryRefused() });
    // @ts-expect-error exercising runtime validation for JavaScript callers
    expect(() => new TraversalOptic({ optic, locator: {} })).toThrow(expect.objectContaining({ code: 'E_TRAVERSAL_OPTIC' }));
  });
});

describe('ConeReadIdentity', () => {
  it('requires its identity fields', () => {
    expect(() => new ConeReadIdentity({
      worldline: LANE, entityAspect: '', basis: ConeBasis.empty(), records: [], reducerVersion: 'r', projectionVersion: 'p',
    })).toThrow(expect.objectContaining({ code: 'E_OPTIC_READ_IDENTITY' }));
  });
});

describe('OpticBasisPosture cone basis', () => {
  it('names the cone basis posture', () => {
    expect(OpticBasisPosture.coneBasis().isConeBasis()).toBe(true);
    expect(OpticBasisPosture.checkpointTailBasisVerified().isConeBasis()).toBe(false);
    expect(OpticBasisPosture.coneBasis().toString()).toBe('cone-basis');
  });
});
