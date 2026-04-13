import { describe, expect, it } from 'vitest';

import ORSet from '../../../../src/domain/crdt/ORSet.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import { encodeDot } from '../../../../src/domain/crdt/Dot.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import { lwwSet } from '../../../../src/domain/crdt/LWW.ts';
import { EventId } from '../../../../src/domain/utils/EventId.ts';
import { encodeEdgeKey, encodeEdgePropKey, encodePropKey } from '../../../../src/domain/services/KeyCodec.ts';
import { createStateReader } from '../../../../src/domain/services/state/StateReader.js';
import {
  normalizeVisibleStateScope,
  nodeIdInVisibleStateScope,
  scopeMaterializedState,
  scopePatchEntriesV1,
} from '../../../../src/domain/services/VisibleStateScope.ts';
import WarpState from '../../../../src/domain/services/state/WarpState.ts';

function buildScopedFixtureState() {
  const nodeAlive = ORSet.empty();
  const edgeAlive = ORSet.empty();
  nodeAlive.add('task:1', Dot.create('alice', 1));
  nodeAlive.add('comparison-artifact:cmp-1', Dot.create('alice', 2));

  const edgeKey = encodeEdgeKey('task:1', 'comparison-artifact:cmp-1', 'governs');
  edgeAlive.add(edgeKey, Dot.create('alice', 3));

  const prop = new Map([
    [encodePropKey('task:1', 'status'), lwwSet(new EventId(1, 'alice', 'abc1234', 0), 'ready')],
    [encodePropKey('comparison-artifact:cmp-1', 'kind'), lwwSet(new EventId(2, 'alice', 'abc1235', 0), 'comparison-artifact')],
    [encodeEdgePropKey('task:1', 'comparison-artifact:cmp-1', 'governs', 'via'), lwwSet(new EventId(3, 'alice', 'abc1236', 0), 'control-plane')],
  ]);

  return new WarpState({
    nodeAlive,
    edgeAlive,
    prop,
    observedFrontier: VersionVector.empty(),
    edgeBirthEvent: new Map([
      [edgeKey, new EventId(3, 'alice', 'abc1236', 0)],
    ]),
  });
}

describe('VisibleStateScope', () => {
  it('normalizes node-id prefix scopes deterministically', () => {
    expect(normalizeVisibleStateScope({
      nodeIdPrefixes: {
        exclude: ['comparison-artifact:', 'comparison-artifact:'],
      },
    })).toEqual({
      nodeIdPrefixes: {
        exclude: ['comparison-artifact:'],
        include: [],
      },
    });
  });

  it('filters nodes, dependent edges, and properties by node-id prefix scope', () => {
    const state = buildScopedFixtureState();
    const scope = normalizeVisibleStateScope({
      nodeIdPrefixes: {
        exclude: ['comparison-artifact:'],
      },
    });

    const scoped = scopeMaterializedState(state, scope);
    const reader = createStateReader(scoped);

    expect(reader.getNodes()).toEqual(['task:1']);
    expect(reader.getEdges()).toEqual([]);
    expect(reader.getNodeProps('task:1')).toEqual({ status: 'ready' });
    expect(reader.getNodeProps('comparison-artifact:cmp-1')).toBeNull();
  });

  it('rejects malformed scope definitions and empty prefix items', () => {
    expect(() => normalizeVisibleStateScope({
      nodeIdPrefixes: {
        include: ['task:', '   '],
      },
    })).toThrow('scope.nodeIdPrefixes.include must contain only non-empty strings');

    expect(() => normalizeVisibleStateScope({
      nodeIdPrefixes: {
        include: ('task:' as unknown),
      },
    })).toThrow('scope.nodeIdPrefixes.include must be an array of non-empty strings');

    expect(() => normalizeVisibleStateScope({
      nodeIdPrefixes: (['task:'] as unknown),
    })).toThrow('scope.nodeIdPrefixes must be an object with include/exclude prefix arrays');

    expect(() => normalizeVisibleStateScope({
      nodeIdPrefixes: {
        include: ['task:'],
        extra: ['bad'],
      },
    })).toThrow('scope.nodeIdPrefixes contains unsupported keys');
  });

  it('collapses empty prefix filters to null', () => {
    expect(normalizeVisibleStateScope({
      nodeIdPrefixes: {},
    })).toBeNull();
  });

  it('treats null scope and missing nodeIdPrefixes rules as visible', () => {
    expect(nodeIdInVisibleStateScope('task:1', null)).toBe(true);
    expect(nodeIdInVisibleStateScope(
      'task:1',
      ({} as any),
    )).toBe(true);
  });

  it('matches include-empty rules and filters edges by endpoint visibility', () => {
    const scope = normalizeVisibleStateScope({
      nodeIdPrefixes: {
        exclude: ['comparison-artifact:'],
      },
    });

    expect(nodeIdInVisibleStateScope('task:1', scope)).toBe(true);
    expect(nodeIdInVisibleStateScope('comparison-artifact:cmp-1', scope)).toBe(false);
  });

  it('preserves in-scope edges, edge properties, and edge birth events while skipping dead edges', () => {
    const state = buildScopedFixtureState();
    const aliveEdgeKey = encodeEdgeKey('task:1', 'comparison-artifact:cmp-1', 'governs');
    const deadEdgeKey = encodeEdgeKey('task:1', 'comparison-artifact:cmp-1', 'stale');
    const deadDot = Dot.create('alice', 99);
    state.edgeAlive.add(deadEdgeKey, deadDot);
    state.edgeAlive.remove(new Set([encodeDot(deadDot)]));

    state.prop.set(
      encodeEdgePropKey('task:1', 'comparison-artifact:cmp-1', 'stale', 'via'),
      lwwSet(new EventId(99, 'alice', 'abc1299', 0), 'obsolete'),
    );
    state.edgeBirthEvent.set(deadEdgeKey, new EventId(99, 'alice', 'abc1299', 0));

    const scope = normalizeVisibleStateScope({
      nodeIdPrefixes: {
        include: ['comparison-artifact:', 'task:'],
      },
    });

    const scoped = scopeMaterializedState(state, scope);
    const reader = createStateReader(scoped);

    expect(reader.getNodes()).toEqual(['comparison-artifact:cmp-1', 'task:1']);
    expect(reader.getEdges()).toEqual([{
      from: 'task:1',
      to: 'comparison-artifact:cmp-1',
      label: 'governs',
      props: { via: 'control-plane' },
    }]);
    expect(reader.getEdgeProps('task:1', 'comparison-artifact:cmp-1', 'governs')).toEqual({
      via: 'control-plane',
    });
    expect(scoped.edgeBirthEvent.has(aliveEdgeKey)).toBe(true);
    expect(scoped.edgeBirthEvent.has(deadEdgeKey)).toBe(false);
  });

  it('filters patch entries by in-scope ops and keeps unscopable ops conservative', () => {
    const scope = normalizeVisibleStateScope({
      nodeIdPrefixes: {
        include: ['task:'],
      },
    });

    const entries = [
      {
        sha: 'a',
        patch: {
          ops: [{ type: 'NodeAdd', node: 'task:1', dot: { writerId: 'w', counter: 1 } }],
        },
      },
      {
        sha: 'b',
        patch: {
          ops: [{ type: 'EdgeAdd', from: 'comparison-artifact:cmp-1', to: 'comparison-artifact:cmp-2', label: 'rel', dot: { writerId: 'w', counter: 2 } }],
        },
      },
      {
        sha: 'c',
        patch: {
          ops: [{ type: 'BlobValue', key: 'blob:1', value: 'x' }],
        },
      },
      {
        sha: 'd',
        patch: {
          ops: [{ type: 'CounterfactualMarker' }],
        },
      },
      {
        sha: 'e',
        patch: {
          ops: [null],
        },
      },
    ];

    expect(scopePatchEntriesV1((entries), scope).map(({ sha }) => sha)).toEqual(['a', 'd', 'e']);
  });
});
