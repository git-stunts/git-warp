import { expect, it } from 'vitest';
import { Dot } from '../../../../../src/domain/crdt/Dot.ts';
import CheckpointTailFactReducer from '../../../../../src/domain/services/optic/CheckpointTailFactReducer.ts';
import type { CheckpointTailPatchEntry } from '../../../../../src/domain/services/optic/CheckpointTailOpticSource.ts';
import type { CheckpointNodeLifecycleRecord } from '../../../../../src/domain/services/optic/CheckpointShardFactReader.ts';
import Patch from '../../../../../src/domain/types/Patch.ts';
import type { PropValue } from '../../../../../src/domain/types/PropValue.ts';
import EdgeAdd from '../../../../../src/domain/types/ops/EdgeAdd.ts';
import EdgeRemove from '../../../../../src/domain/types/ops/EdgeRemove.ts';
import NodeAdd from '../../../../../src/domain/types/ops/NodeAdd.ts';
import NodePropSet from '../../../../../src/domain/types/ops/NodePropSet.ts';
import NodeRemove from '../../../../../src/domain/types/ops/NodeRemove.ts';
import LegacyEventId from '../../../../../src/domain/utils/LegacyEventId.ts';

const reducer = new CheckpointTailFactReducer({ graphName: 'admission' });
function entry(ops: Patch['ops'], lamport = 1): CheckpointTailPatchEntry {
  return { sha: 'aaaa', patch: new Patch({ schema: 3, writer: 'A', lamport, context: {}, ops }) };
}
function witnessed(tailEntries: readonly CheckpointTailPatchEntry[], baseValue: PropValue | undefined) {
  return reducer.reduceProperty({ nodeId: 'n', propertyKey: 'key', baseValue, tailEntries,
    checkpointLifecycle: { kind: 'witnessed', lifecycle: {}, baseAlive: true,
      baseRegisterEvent: new LegacyEventId(7), floatingTombstones: new Set() } });
}

it('scopes lifecycle and property scans to the requested node and key', () => {
  const property = entry([new NodePropSet('n', 'key', 'new')]);
  expect(reducer.includesProperty(property, 'n', 'key')).toBe(true);
  expect(reducer.includesProperty(property, 'n', 'other')).toBe(false);
  expect(reducer.includesNodeLiveness(property, 'n')).toBe(false);
  const removal = entry([new NodeRemove('n', ['A:1'])]);
  expect(reducer.includesNodeLiveness(removal, 'n')).toBe(true);
  expect(reducer.includesNodeLiveness(removal, 'other')).toBe(false);
  expect(reducer.includesProperty(entry([new NodeRemove('n', [])]), 'n', 'key')).toBe(false);
});

it('selects neighborhood endpoints by direction and label, deduplicating self loops', () => {
  const edges = entry([new EdgeAdd({ from: 'n', to: 'm', label: 'link', dot: new Dot('A', 1) }),
    new EdgeRemove({ from: 'm', to: 'm', label: 'link', observedDots: ['A:2'] }),
    new NodePropSet('n', 'key', 'irrelevant')]);
  expect(reducer.neighborhoodNodeIds(edges, { direction: 'in', labels: [] })).toEqual(['m']);
  expect(reducer.neighborhoodNodeIds(edges, { direction: 'out', labels: ['link'] })).toEqual(['m', 'n']);
  expect(reducer.neighborhoodNodeIds(edges, { direction: 'both', labels: [] })).toEqual(['m', 'n']);
  expect(reducer.includesNeighborhood(edges, { nodeId: 'n', direction: 'in', labels: [] })).toBe(false);
  expect(reducer.includesNeighborhood(edges, { nodeId: 'n', direction: 'out', labels: ['link'] })).toBe(true);
  expect(reducer.neighborhoodNodeIds(edges, { direction: 'both', labels: ['other'] })).toEqual([]);
});

it('refuses unstable neighborhood tails and missing checkpoint values', () => {
  expect(() => reducer.assertNeighborhoodTailStable([])).not.toThrow();
  expect(() => reducer.assertNeighborhoodTailStable([entry([])])).toThrow(
    expect.objectContaining({ code: 'E_OPTIC_NO_BOUNDED_BASIS' }));
  expect(() => witnessed([entry([new NodeAdd('n', new Dot('A', 1))])], undefined))
    .toThrow(expect.objectContaining({ code: 'E_OPTIC_NO_BOUNDED_BASIS' }));
});

it.each<PropValue>([null, 'new', 42, false, new Uint8Array([1, 2])])(
  'compares admitted historical registers with scalar tail value %j', value => {
    const write = entry([new NodePropSet('n', 'key', value)], 8);
    expect(witnessed([write], 'old')).toEqual(value);
    expect(witnessed([entry([new NodePropSet('n', 'key', value)], 1)], 'old')).toBe('old');
  });

it('refuses tail payloads that need a parser and unwitnessed property changes', () => {
  expect(() => witnessed([entry([new NodePropSet('n', 'key', { nested: 'value' })], 8)], 'old'))
    .toThrow(expect.objectContaining({ code: 'E_OPTIC_NO_BOUNDED_BASIS' }));
  for (const op of [new NodePropSet('n', 'key', 'new'), new NodeRemove('n', ['A:1'])]) {
    expect(() => reducer.reduceProperty({ nodeId: 'n', propertyKey: 'key', baseValue: 'old',
      tailEntries: [entry([op])], checkpointLifecycle: { kind: 'unwitnessed' } }))
      .toThrow(expect.objectContaining({ code: 'E_OPTIC_NO_BOUNDED_BASIS' }));
  }
});

it('refuses a sparse runtime patch instead of returning a checkpoint answer', () => {
  expect(() => witnessed([entry(new Array<Patch['ops'][number]>(1))], 'old')).toThrow();
});

it('refuses target node removals during bounded liveness reads while ignoring other nodes', () => {
  const lifecycle: CheckpointNodeLifecycleRecord = { kind: 'unwitnessed' };
  const options = { nodeId: 'n', baseAlive: true, lifecycle };
  expect(reducer.reduceNodeLiveness({ ...options,
    tailEntries: [entry([new NodeRemove('other', ['A:1'])])] })).toBe(true);
  expect(() => reducer.reduceNodeLiveness({ ...options,
    tailEntries: [entry([new NodeRemove('n', ['A:1'])])] }))
    .toThrow(expect.objectContaining({ code: 'E_OPTIC_NO_BOUNDED_BASIS' }));
});
