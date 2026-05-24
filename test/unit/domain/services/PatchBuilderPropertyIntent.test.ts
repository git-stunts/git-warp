import { describe, expect, it } from 'vitest';

import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import PatchError from '../../../../src/domain/errors/PatchError.ts';
import { PatchBuilder } from '../../../../src/domain/services/PatchBuilder.ts';
import {
  encodeEdgeKey,
  encodeLegacyEdgePropNode,
} from '../../../../src/domain/services/KeyCodec.ts';
import WarpState from '../../../../src/domain/services/state/WarpState.ts';
import PropSet from '../../../../src/domain/types/ops/PropSet.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';

const TEST_SHA = 'a'.repeat(40);

describe('PatchBuilder property intent lowering', () => {
  it('lowers node property intents to the current PropSet shape', () => {
    const builder = createBuilder(null);

    builder.setProperty('node:1', 'status', 'ready');

    const patch = builder.build();
    expect(patch.ops).toHaveLength(1);
    const op = requirePropSet(patch.ops[0]);
    expect(op.node).toBe('node:1');
    expect(op.key).toBe('status');
    expect(op.value).toBe('ready');
    expect(patch.schema).toBe(2);
  });

  it('lowers edge property intents to the current legacy edge PropSet shape', () => {
    const state = stateWithEdge();
    const builder = createBuilder(state);

    builder.setEdgeProperty('node:1', 'node:2', 'rel', 'weight', 3);

    const patch = builder.build();
    expect(patch.ops).toHaveLength(1);
    const op = requirePropSet(patch.ops[0]);
    expect(op.node).toBe(encodeLegacyEdgePropNode('node:1', 'node:2', 'rel'));
    expect(op.key).toBe('weight');
    expect(op.value).toBe(3);
    expect(patch.schema).toBe(3);
  });

  it('rejects invalid node property values before appending operations', () => {
    const builder = createBuilder(null);

    expect(() => {
      builder.setProperty('node:1', 'status', new InvalidPropertyCarrier());
    }).toThrow(PatchError);
    expect(builder.build().ops).toEqual([]);
  });

  it('rejects malformed edge targets before appending operations', () => {
    const builder = createBuilder(stateWithEdge());

    expect(() => {
      builder.setEdgeProperty('', 'node:2', 'rel', 'weight', 3);
    }).toThrow(/NodeId/);
    expect(builder.build().ops).toEqual([]);
  });

  it('accepts bytes, arrays, and recursive property-compatible objects', () => {
    const builder = createBuilder(null);
    const bytes = new Uint8Array([1, 2, 3]);

    builder.setProperty('node:1', 'payload', {
      bytes,
      nested: [1, 'ok', { done: true }],
    });

    const patch = builder.build();
    expect(patch.schema).toBe(2);
    const op = requirePropSet(patch.ops[0]);
    expect(op.node).toBe('node:1');
    expect(op.key).toBe('payload');
    expect(op.value).toEqual({
      bytes,
      nested: [1, 'ok', { done: true }],
    });
  });

  it('rejects cyclic property values before appending operations', () => {
    const builder = createBuilder(null);
    const cyclic: CyclicPropertyValue = {};
    cyclic.self = cyclic;

    expect(() => {
      builder.setProperty('node:1', 'payload', cyclic);
    }).toThrow(PatchError);
    expect(builder.build().ops).toEqual([]);
  });

  it('rejects prototype-polluting object keys before appending operations', () => {
    const builder = createBuilder(null);
    const payload = { safe: 'ok' };
    Object.defineProperty(payload, '__proto__', {
      value: 'polluted',
      enumerable: true,
    });

    expect(() => {
      builder.setProperty('node:1', 'payload', payload);
    }).toThrow(PatchError);
    expect(builder.build().ops).toEqual([]);
  });
});

type CyclicPropertyValue = {
  self?: CyclicPropertyValue;
};

function createBuilder(state: WarpState | null): PatchBuilder {
  return new PatchBuilder({
    persistence: unusedPersistence(),
    graphName: 'graph',
    writerId: 'writer',
    lamport: 1,
    versionVector: VersionVector.empty(),
    getCurrentState: () => state,
  });
}

function stateWithEdge(): WarpState {
  const state = WarpState.empty();
  state.nodeAlive.add('node:1', Dot.create('writer', 1));
  state.nodeAlive.add('node:2', Dot.create('writer', 2));
  state.edgeAlive.add(encodeEdgeKey('node:1', 'node:2', 'rel'), Dot.create('writer', 3));
  return state;
}

function requirePropSet(op: object | undefined): PropSet {
  if (op instanceof PropSet) {
    return op;
  }
  throw new PatchError('Expected PropSet in test output', { code: 'E_TEST_EXPECTED_PROP_SET' });
}

function unusedPersistence() {
  return {
    commitNode: async () => TEST_SHA,
    showNode: async () => '',
    getNodeInfo: async () => ({
      sha: TEST_SHA,
      message: '',
      author: '',
      date: '',
      parents: [],
    }),
    logNodes: async () => '',
    logNodesStream: async () => {
      throw new PatchError('unused logNodesStream', { code: 'E_TEST_UNUSED_PORT' });
    },
    countNodes: async () => 0,
    commitNodeWithTree: async () => TEST_SHA,
    nodeExists: async () => true,
    getCommitTree: async () => TEST_SHA,
    ping: async () => ({ ok: true, latencyMs: 0 }),
    writeBlob: async () => TEST_SHA,
    readBlob: async () => new Uint8Array(),
    writeTree: async () => TEST_SHA,
    readTree: async () => ({}),
    readTreeOids: async () => ({}),
    get emptyTree() {
      return TEST_SHA;
    },
    updateRef: async () => {},
    readRef: async () => null,
    deleteRef: async () => {},
    listRefs: async () => [],
    compareAndSwapRef: async () => {},
  };
}

class InvalidPropertyCarrier {}
