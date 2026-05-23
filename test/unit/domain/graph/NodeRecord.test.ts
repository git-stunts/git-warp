import { describe, expect, it } from 'vitest';

import NodeId from '../../../../src/domain/graph/NodeId.ts';
import NodeRecord from '../../../../src/domain/graph/NodeRecord.ts';
import NodeTypeId from '../../../../src/domain/graph/NodeTypeId.ts';
import WarpError from '../../../../src/domain/errors/WarpError.ts';

describe('NodeRecord graph substrate nouns', () => {
  it('validates node ids as runtime-backed graph identifiers', () => {
    const id = new NodeId('node:a');

    expect(id.toString()).toBe('node:a');
    expect(id.equals(new NodeId('node:a'))).toBe(true);
    expect(id.equals(new NodeId('node:b'))).toBe(false);
    expect(Object.isFrozen(id)).toBe(true);
    expect(() => new NodeId('')).toThrow(WarpError);
    expect(() => new NodeId('node:\0bad')).toThrow(WarpError);
    expect(() => new NodeId('\x01reserved')).toThrow(WarpError);
  });

  it('validates node type ids separately from node identity', () => {
    const typeId = new NodeTypeId('task');

    expect(typeId.toString()).toBe('task');
    expect(typeId.equals(new NodeTypeId('task'))).toBe(true);
    expect(typeId.equals(new NodeTypeId('document'))).toBe(false);
    expect(Object.isFrozen(typeId)).toBe(true);
    expect(() => new NodeTypeId('')).toThrow(WarpError);
    expect(() => new NodeTypeId('type\0bad')).toThrow(WarpError);
  });

  it('represents legacy node ids as immutable untyped node records', () => {
    const record = NodeRecord.fromLegacyNodeId('node:a');

    expect(record.id).toBeInstanceOf(NodeId);
    expect(record.typeId).toBeInstanceOf(NodeTypeId);
    expect(record.id.toString()).toBe('node:a');
    expect(record.typeId.toString()).toBe('untyped-node');
    expect(record.equals(NodeRecord.fromLegacyNodeId('node:a'))).toBe(true);
    expect(record.equals(NodeRecord.fromLegacyNodeId('node:b'))).toBe(false);
    expect(Object.isFrozen(record)).toBe(true);
  });
});
