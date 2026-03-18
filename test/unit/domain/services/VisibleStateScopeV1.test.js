import { describe, expect, it } from 'vitest';

import { createORSet, orsetAdd } from '../../../../src/domain/crdt/ORSet.js';
import { createDot } from '../../../../src/domain/crdt/Dot.js';
import { createVersionVector } from '../../../../src/domain/crdt/VersionVector.js';
import { lwwSet } from '../../../../src/domain/crdt/LWW.js';
import { createEventId } from '../../../../src/domain/utils/EventId.js';
import {
  encodeEdgeKey,
  encodeEdgePropKey,
  encodePropKey,
} from '../../../../src/domain/services/KeyCodec.js';
import { createStateReaderV5 } from '../../../../src/domain/services/StateReaderV5.js';
import {
  normalizeVisibleStateScopeV1,
  scopeMaterializedStateV5,
} from '../../../../src/domain/services/VisibleStateScopeV1.js';

function buildScopedFixtureState() {
  const nodeAlive = createORSet();
  const edgeAlive = createORSet();
  orsetAdd(nodeAlive, 'task:1', createDot('alice', 1));
  orsetAdd(nodeAlive, 'comparison-artifact:cmp-1', createDot('alice', 2));

  const edgeKey = encodeEdgeKey('task:1', 'comparison-artifact:cmp-1', 'governs');
  orsetAdd(edgeAlive, edgeKey, createDot('alice', 3));

  const prop = new Map([
    [encodePropKey('task:1', 'status'), lwwSet(createEventId(1, 'alice', 'abc1234', 0), 'ready')],
    [encodePropKey('comparison-artifact:cmp-1', 'kind'), lwwSet(createEventId(2, 'alice', 'abc1235', 0), 'comparison-artifact')],
    [encodeEdgePropKey('task:1', 'comparison-artifact:cmp-1', 'governs', 'via'), lwwSet(createEventId(3, 'alice', 'abc1236', 0), 'control-plane')],
  ]);

  return {
    nodeAlive,
    edgeAlive,
    prop,
    observedFrontier: createVersionVector(),
    edgeBirthEvent: new Map([
      [edgeKey, createEventId(3, 'alice', 'abc1236', 0)],
    ]),
  };
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
});
