import { describe, expect, it } from 'vitest';

import ORSet from '../../../../src/domain/crdt/ORSet.ts';
import { createDot } from '../../../../src/domain/crdt/Dot.ts';
import { encodeDot } from '../../../../src/domain/crdt/Dot.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import { lwwSet } from '../../../../src/domain/crdt/LWW.ts';
import { createEventId } from '../../../../src/domain/utils/EventId.ts';
import { encodeEdgeKey, encodeEdgePropKey, encodePropKey } from '../../../../src/domain/services/KeyCodec.js';
import { createStateReaderV5 } from '../../../../src/domain/services/state/StateReaderV5.js';
import {
  normalizeVisibleStateScopeV1,
  nodeIdInVisibleStateScope,
  scopeMaterializedStateV5,
  scopePatchEntriesV1,
} from '../../../../src/domain/services/VisibleStateScopeV1.js';
import WarpStateV5 from '../../../../src/domain/services/state/WarpStateV5.js';

function buildScopedFixtureState() {
  const nodeAlive = ORSet.empty();
  const edgeAlive = ORSet.empty();
  nodeAlive.add('task:1', createDot('alice', 1));
  nodeAlive.add('comparison-artifact:cmp-1', createDot('alice', 2));

  const edgeKey = encodeEdgeKey('task:1', 'comparison-artifact:cmp-1', 'governs');
  edgeAlive.add(edgeKey, createDot('alice', 3));

  const prop = new Map([
    [encodePropKey('task:1', 'status'), lwwSet(createEventId(1, 'alice', 'abc1234', 0), 'ready')],
    [encodePropKey('comparison-artifact:cmp-1', 'kind'), lwwSet(createEventId(2, 'alice', 'abc1235', 0), 'comparison-artifact')],
    [encodeEdgePropKey('task:1', 'comparison-artifact:cmp-1', 'governs', 'via'), lwwSet(createEventId(3, 'alice', 'abc1236', 0), 'control-plane')],
  ]);

  return new WarpStateV5({
    nodeAlive,
    edgeAlive,
    prop,
    observedFrontier: VersionVector.empty(),
    edgeBirthEvent: new Map([
      [edgeKey, createEventId(3, 'alice', 'abc1236', 0)],
    ]),
  });
}

describe('VisibleStateScopeV1', () => {
  it('normalizes node-id prefix scopes deterministically', () => {
    expect(normalizeVisibleStateScopeV1({
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
    const scope = normalizeVisibleStateScopeV1({
      nodeIdPrefixes: {
        exclude: ['comparison-artifact:'],
      },
    });

    const scoped = scopeMaterializedStateV5(state, scope);
    const reader = createStateReaderV5(scoped);

    expect(reader.getNodes()).toEqual(['task:1']);
    expect(reader.getEdges()).toEqual([]);
    expect(reader.getNodeProps('task:1')).toEqual({ status: 'ready' });
    expect(reader.getNodeProps('comparison-artifact:cmp-1')).toBeNull();
  });

  it('rejects malformed scope definitions and empty prefix items', () => {
    expect(() => normalizeVisibleStateScopeV1({
      nodeIdPrefixes: {
        include: ['task:', '   '],
      },
    })).toThrow('scope.nodeIdPrefixes.include must contain only non-empty strings');

    expect(() => normalizeVisibleStateScopeV1({
      nodeIdPrefixes: {
        include: /** @type {unknown} */ ('task:'),
      },
    })).toThrow('scope.nodeIdPrefixes.include must be an array of non-empty strings');

    expect(() => normalizeVisibleStateScopeV1({
      nodeIdPrefixes: /** @type {unknown} */ (['task:']),
    })).toThrow('scope.nodeIdPrefixes must be an object with include/exclude prefix arrays');

    expect(() => normalizeVisibleStateScopeV1({
      nodeIdPrefixes: {
        include: ['task:'],
        extra: ['bad'],
      },
    })).toThrow('scope.nodeIdPrefixes contains unsupported keys');
  });

  it('collapses empty prefix filters to null', () => {
    expect(normalizeVisibleStateScopeV1({
      nodeIdPrefixes: {},
    })).toBeNull();
  });

  it('treats null scope and missing nodeIdPrefixes rules as visible', () => {
    expect(nodeIdInVisibleStateScope('task:1', null)).toBe(true);
    expect(nodeIdInVisibleStateScope(
      'task:1',
      /** @type {import('../../../../src/domain/services/VisibleStateScopeV1.js').VisibleStateScopeV1} */ ({}),
    )).toBe(true);
  });

  it('matches include-empty rules and filters edges by endpoint visibility', () => {
    const scope = normalizeVisibleStateScopeV1({
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
    const deadDot = createDot('alice', 99);
    state.edgeAlive.add(deadEdgeKey, deadDot);
    state.edgeAlive.remove(new Set([encodeDot(deadDot)]));

    state.prop.set(
      encodeEdgePropKey('task:1', 'comparison-artifact:cmp-1', 'stale', 'via'),
      lwwSet(createEventId(99, 'alice', 'abc1299', 0), 'obsolete'),
    );
    state.edgeBirthEvent.set(deadEdgeKey, createEventId(99, 'alice', 'abc1299', 0));

    const scope = normalizeVisibleStateScopeV1({
      nodeIdPrefixes: {
        include: ['comparison-artifact:', 'task:'],
      },
    });

    const scoped = scopeMaterializedStateV5(state, scope);
    const reader = createStateReaderV5(scoped);

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
    const scope = normalizeVisibleStateScopeV1({
      nodeIdPrefixes: {
        include: ['task:'],
      },
    });

    const entries = [
      {
        sha: 'a',
        patch: {
          ops: [{ type: 'NodeAdd', node: 'task:1' }],
        },
      },
      {
        sha: 'b',
        patch: {
          ops: [{ type: 'EdgeAdd', from: 'comparison-artifact:cmp-1', to: 'comparison-artifact:cmp-2', label: 'rel' }],
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

    expect(scopePatchEntriesV1(entries, scope).map(({ sha }) => sha)).toEqual(['a', 'd', 'e']);
  });
});
