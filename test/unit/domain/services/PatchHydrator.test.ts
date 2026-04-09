import { describe, expect, it } from 'vitest';

import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import PatchError from '../../../../src/domain/errors/PatchError.ts';
import { hydrateDecodedPatch } from '../../../../src/domain/services/PatchHydrator.ts';
import Patch from '../../../../src/domain/types/Patch.ts';
import BlobValue from '../../../../src/domain/types/ops/BlobValue.ts';
import EdgeAdd from '../../../../src/domain/types/ops/EdgeAdd.ts';
import EdgePropSet from '../../../../src/domain/types/ops/EdgePropSet.ts';
import EdgeRemove from '../../../../src/domain/types/ops/EdgeRemove.ts';
import NodeAdd from '../../../../src/domain/types/ops/NodeAdd.ts';
import NodePropSet from '../../../../src/domain/types/ops/NodePropSet.ts';
import NodeRemove from '../../../../src/domain/types/ops/NodeRemove.ts';
import PropSet from '../../../../src/domain/types/ops/PropSet.ts';

describe('PatchHydrator', () => {
  it('hydrates supported decoded ops into runtime-backed patch objects', () => {
    const patch = hydrateDecodedPatch({
      schema: 3,
      writer: 'alice',
      lamport: 7,
      context: new Map([['seed', 3]]),
      reads: ['user:alice'],
      writes: ['user:alice', 'edge:friend'],
      ops: [
        { type: 'NodeAdd', id: 'user:alice', dot: ['alice', 1] },
        { type: 'EdgeAdd', from: 'user:alice', to: 'user:bob', label: 'friend', dot: { writer: 'alice', seq: 2 } },
        { type: 'NodeRemove', node: 'user:charlie', observedDots: ['alice:1'] },
        {
          type: 'EdgeRemove',
          from: 'user:alice',
          to: 'user:bob',
          label: 'friend',
          observedDots: new Set(['alice:2']),
        },
        { type: 'PropSet', node: 'user:alice', key: 'name', value: 'Alice' },
        { type: 'NodePropSet', node: 'user:alice', key: 'role', value: 'admin' },
        {
          type: 'EdgePropSet',
          from: 'user:alice',
          to: 'user:bob',
          label: 'friend',
          key: 'since',
          value: 2026,
        },
        { type: 'BlobValue', node: 'user:alice', oid: 'blob-oid' },
      ],
    });

    expect(patch).toBeInstanceOf(Patch);
    expect(patch.schema).toBe(3);
    expect(patch.context).toEqual({ seed: 3 });
    expect(patch.reads).toEqual(['user:alice']);
    expect(patch.writes).toEqual(['user:alice', 'edge:friend']);

    const [
      nodeAdd,
      edgeAdd,
      nodeRemove,
      edgeRemove,
      propSet,
      nodePropSet,
      edgePropSet,
      blobValue,
    ] = patch.ops;

    expect(nodeAdd).toBeInstanceOf(NodeAdd);
    expect(edgeAdd).toBeInstanceOf(EdgeAdd);
    expect(nodeRemove).toBeInstanceOf(NodeRemove);
    expect(edgeRemove).toBeInstanceOf(EdgeRemove);
    expect(propSet).toBeInstanceOf(PropSet);
    expect(nodePropSet).toBeInstanceOf(NodePropSet);
    expect(edgePropSet).toBeInstanceOf(EdgePropSet);
    expect(blobValue).toBeInstanceOf(BlobValue);

    if (!(nodeAdd instanceof NodeAdd)) {
      throw new Error('expected NodeAdd');
    }
    if (!(edgeAdd instanceof EdgeAdd)) {
      throw new Error('expected EdgeAdd');
    }

    expect(nodeAdd.node).toBe('user:alice');
    expect(nodeAdd.dot).toEqual(new Dot('alice', 1));
    expect(edgeAdd.dot).toEqual(new Dot('alice', 2));
  });

  it('preserves runtime VersionVector context and direct dot objects', () => {
    const context = VersionVector.from({ alice: 4 });
    const patch = hydrateDecodedPatch({
      writer: 'alice',
      lamport: 5,
      context,
      ops: [{ type: 'NodeAdd', node: 'user:alice', dot: { writerId: 'alice', counter: 5 } }],
    });

    expect(patch.context).toBe(context);
    expect(patch.reads).toBeUndefined();
    expect(patch.writes).toBeUndefined();

    const [nodeAdd] = patch.ops;
    expect(nodeAdd).toBeInstanceOf(NodeAdd);
    if (!(nodeAdd instanceof NodeAdd)) {
      throw new Error('expected NodeAdd');
    }
    expect(nodeAdd.dot).toEqual(new Dot('alice', 5));
  });

  it('defaults missing schema and context to V2 + empty frontier', () => {
    const patch = hydrateDecodedPatch({
      writer: 'alice',
      lamport: 1,
      ops: [{ type: 'BlobValue', node: 'user:alice', oid: 'blob-1' }],
    });

    expect(patch.schema).toBe(2);
    expect(patch.context).toEqual({});
  });

  it('rejects unknown op types', () => {
    expect(() => hydrateDecodedPatch({
      writer: 'alice',
      lamport: 1,
      ops: [{ type: 'BogusOp' }],
    })).toThrow(PatchError);
  });

  it('rejects non-string writers', () => {
    expect(() => hydrateDecodedPatch({
      writer: 7,
      lamport: 1,
      ops: [],
    })).toThrow("Decoded patch requires string 'writer'");
  });

  it('rejects non-integer lamports', () => {
    expect(() => hydrateDecodedPatch({
      writer: 'alice',
      lamport: 1.5,
      ops: [],
    })).toThrow("Decoded patch requires integer 'lamport'");
  });

  it('rejects invalid string array fields', () => {
    expect(() => hydrateDecodedPatch({
      writer: 'alice',
      lamport: 1,
      reads: ['ok', 7],
      ops: [],
    })).toThrow("Decoded patch field 'reads' must be an array of strings");
  });

  it('rejects malformed context entries', () => {
    expect(() => hydrateDecodedPatch({
      writer: 'alice',
      lamport: 1,
      context: { alice: 'nope' },
      ops: [],
    })).toThrow("Decoded patch context 'alice' must be a number");
  });

  it('rejects malformed context maps', () => {
    expect(() => hydrateDecodedPatch({
      writer: 'alice',
      lamport: 1,
      context: new Map([[7, 'nope']]),
      ops: [],
    })).toThrow('Decoded patch context Map must contain string -> number entries');
  });

  it('rejects malformed dot tuples', () => {
    expect(() => hydrateDecodedPatch({
      writer: 'alice',
      lamport: 1,
      ops: [{ type: 'NodeAdd', node: 'user:alice', dot: ['alice'] }],
    })).toThrow('NodeAdd dot tuple must be [writerId, counter]');
  });

  it('rejects malformed dot objects', () => {
    expect(() => hydrateDecodedPatch({
      writer: 'alice',
      lamport: 1,
      ops: [{ type: 'EdgeAdd', from: 'a', to: 'b', label: 'x', dot: { writerId: 'alice' } }],
    })).toThrow('EdgeAdd dot requires integer counter/seq');
  });
});
