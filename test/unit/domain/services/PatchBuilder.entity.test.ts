import { describe, expect, it } from 'vitest';

import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import PatchError from '../../../../src/domain/errors/PatchError.ts';
import { PatchBuilder } from '../../../../src/domain/services/PatchBuilder.ts';
import WarpState from '../../../../src/domain/services/state/WarpState.ts';
import NodeAdd from '../../../../src/domain/types/ops/NodeAdd.ts';
import PropSet from '../../../../src/domain/types/ops/PropSet.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import {
  createPatchBuilder,
  createPatchBuilderMockPersistence,
  createPatchJournal,
} from './PatchBuilderTestHarness.ts';

const TEST_SHA = 'a'.repeat(40);

describe('PatchBuilder entity capture', () => {
  it('lowers one entity to a NodeAdd followed by its provided initial payload', () => {
    const builder = createBuilder(null);

    builder.addEntity('entry:1785597386985-c538d1bd', {
      kind: 'capture',
      sortKey: '1785597386985-c538d1bd',
      text: 'probe write two',
    });

    const patch = builder.build();
    expect(patch.ops).toHaveLength(4);
    expect(patch.ops[0]).toBeInstanceOf(NodeAdd);
    expect(requireNodeAdd(patch.ops[0]).node).toBe('entry:1785597386985-c538d1bd');
    expect(patch.ops.slice(1).map((op) => requirePropSet(op).key)).toEqual([
      'kind',
      'sortKey',
      'text',
    ]);
    expect(patch.ops.slice(1).map((op) => requirePropSet(op).node)).toEqual(
      Array.from({ length: 3 }, () => 'entry:1785597386985-c538d1bd')
    );
    expect(requirePropSet(patch.ops[3]).value).toBe('probe write two');
  });

  it('declares an empty read set and exactly one subject write', () => {
    const builder = createBuilder(null);

    builder.addEntity('entry:1', { kind: 'capture', text: 'a fact' });

    expect([...builder.reads]).toEqual([]);
    expect([...builder.writes]).toEqual(['entry:1']);
  });

  it('persists the exact supplied-subject operation boundary', () => {
    const builder = createBuilder(null);

    builder.addNode('seed');
    builder.addEntity('entry:1', { kind: 'capture', text: 'a fact' });

    expect(builder.build().entityAdmissions).toEqual([
      expect.objectContaining({
        operationIndex: 1,
        operationCount: 3,
        origin: expect.objectContaining({
          kind: 'supplied-subject',
          namespace: null,
        }),
      }),
    ]);
  });

  it('persists the allocator namespace without asking readers to parse the subject', () => {
    const builder = createBuilder(null);

    builder.addEntityAuto('entry', { kind: 'capture' });

    expect(builder.build().entityAdmissions).toEqual([
      expect.objectContaining({
        operationIndex: 0,
        operationCount: 2,
        origin: expect.objectContaining({
          kind: 'allocated',
          namespace: 'entry',
        }),
      }),
    ]);
  });

  it('rejects an entity whose id already exists in the graph', () => {
    const builder = createBuilder(stateWithNode('entry:1'));

    expect(() => {
      builder.addEntity('entry:1', { kind: 'capture' });
    }).toThrowError(
      expect.objectContaining({
        code: 'E_PATCH_ENTITY_EXISTS',
      })
    );
    expect(builder.build().ops).toEqual([]);
  });

  it('rejects an entity whose id this patch already wrote', () => {
    const builder = createBuilder(null);
    builder.addEntity('entry:1', { kind: 'capture' });

    expect(() => {
      builder.addEntity('entry:1', { kind: 'capture' });
    }).toThrowError(
      expect.objectContaining({
        code: 'E_PATCH_ENTITY_EXISTS',
      })
    );
  });

  it('requires at least one property so an entity is never an empty shell', () => {
    const builder = createBuilder(null);

    expect(() => {
      builder.addEntity('entry:1', {});
    }).toThrowError(
      expect.objectContaining({
        code: 'E_PATCH_ENTITY_EMPTY',
      })
    );
    expect(builder.build().ops).toEqual([]);
  });

  it.each([null, 'capture', ['capture'], new EntityPayloadCarrier()])(
    'rejects non-record entity payload %# before appending any operation',
    (payload) => {
      const builder = createBuilder(null);

      expect(() => {
        // @ts-expect-error Exercise the JavaScript boundary.
        builder.addEntity('entry:1', payload);
      }).toThrowError(expect.objectContaining({ code: 'E_PATCH_ENTITY_PAYLOAD' }));
      expect(builder.build().ops).toEqual([]);
    }
  );

  it('rejects invalid property values before appending any operation', () => {
    const builder = createBuilder(null);

    expect(() => {
      builder.addEntity('entry:1', {
        kind: 'capture',
        // @ts-expect-error Exercise the JavaScript boundary.
        broken: new InvalidPropertyCarrier(),
      });
    }).toThrow(PatchError);
    expect(builder.build().ops).toEqual([]);
  });

  it('rejects a reserved id before appending any operation', () => {
    const builder = createBuilder(null);

    expect(() => {
      builder.addEntity('', { kind: 'capture' });
    }).toThrow(/NodeId/);
    expect(builder.build().ops).toEqual([]);
  });

  it('copies the payload so later caller mutation cannot rewrite the patch', () => {
    const builder = createBuilder(null);
    const payload = { tags: ['first'] };

    builder.addEntity('entry:1', payload);
    payload.tags.push('second');

    const op = requirePropSet(builder.build().ops[1]);
    expect(op.key).toBe('tags');
    expect(op.value).toEqual(['first']);
  });

  it('enforces the committed lifecycle before validating entity input', async () => {
    const persistence = createPatchBuilderMockPersistence();
    const builder = createPatchBuilder({
      persistence,
      patchJournal: createPatchJournal(persistence),
    });
    builder.addNode('seed');
    await builder.commitWithEvidence();

    expect(() => builder.addEntity('entry:1', {})).toThrowError(
      expect.objectContaining({
        code: 'E_PATCH_ALREADY_COMMITTED',
      })
    );
  });
});

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

function stateWithNode(nodeId: string): WarpState {
  const state = WarpState.empty();
  state.nodeAlive.add(nodeId, Dot.create('writer', 1));
  return state;
}

function requirePropSet(op: object | undefined): PropSet {
  if (op instanceof PropSet) {
    return op;
  }
  throw new PatchError('Expected PropSet in test output', { code: 'E_TEST_EXPECTED_PROP_SET' });
}

function requireNodeAdd(op: object | undefined): NodeAdd {
  if (op instanceof NodeAdd) {
    return op;
  }
  throw new PatchError('Expected NodeAdd in test output', { code: 'E_TEST_EXPECTED_NODE_ADD' });
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

class EntityPayloadCarrier {
  readonly kind = 'capture';
}
