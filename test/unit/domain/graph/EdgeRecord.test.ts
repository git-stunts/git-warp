import { describe, expect, it } from 'vitest';

import EdgeId from '../../../../src/domain/graph/EdgeId.ts';
import EdgeRecord from '../../../../src/domain/graph/EdgeRecord.ts';
import EdgeTypeId from '../../../../src/domain/graph/EdgeTypeId.ts';
import NodeId from '../../../../src/domain/graph/NodeId.ts';
import WarpError from '../../../../src/domain/errors/WarpError.ts';

describe('EdgeRecord graph substrate nouns', () => {
  it('validates edge ids as runtime-backed graph identifiers', () => {
    const id = new EdgeId('edge:node-a:node-b:knows');

    expect(id.toString()).toBe('edge:node-a:node-b:knows');
    expect(id.equals(new EdgeId('edge:node-a:node-b:knows'))).toBe(true);
    expect(id.equals(new EdgeId('edge:node-a:node-c:knows'))).toBe(false);
    expect(Object.isFrozen(id)).toBe(true);
    expect(() => new EdgeId('')).toThrow(WarpError);
    expect(() => new EdgeId('edge\0bad')).toThrow(WarpError);
    expect(() => new EdgeId('\x01reserved')).toThrow(WarpError);
  });

  it('validates edge type ids separately from edge identity', () => {
    const typeId = new EdgeTypeId('knows');

    expect(typeId.toString()).toBe('knows');
    expect(typeId.equals(new EdgeTypeId('knows'))).toBe(true);
    expect(typeId.equals(new EdgeTypeId('likes'))).toBe(false);
    expect(Object.isFrozen(typeId)).toBe(true);
    expect(() => new EdgeTypeId('')).toThrow(WarpError);
    expect(() => new EdgeTypeId('type\0bad')).toThrow(WarpError);
  });

  it('maps legacy edge triples to immutable edge records', () => {
    const record = EdgeRecord.fromLegacyEdge({ from: 'node:a', to: 'node:b', label: 'knows' });

    expect(record.id).toBeInstanceOf(EdgeId);
    expect(record.from).toBeInstanceOf(NodeId);
    expect(record.to).toBeInstanceOf(NodeId);
    expect(record.typeId).toBeInstanceOf(EdgeTypeId);
    expect(record.from.toString()).toBe('node:a');
    expect(record.to.toString()).toBe('node:b');
    expect(record.typeId.toString()).toBe('knows');
    expect(record.id.toString()).toBe('legacy-edge:6:node:a:6:node:b:5:knows');
    expect(record.equals(EdgeRecord.fromLegacyEdge({ from: 'node:a', to: 'node:b', label: 'knows' })))
      .toBe(true);
    expect(record.equals(EdgeRecord.fromLegacyEdge({ from: 'node:a', to: 'node:b', label: 'likes' })))
      .toBe(false);
    expect(Object.isFrozen(record)).toBe(true);
  });
});
