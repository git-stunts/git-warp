import { describe, expect, it } from 'vitest';

import WarpError from '../../../../src/domain/errors/WarpError.ts';
import {
  EdgeRecord,
  LegacyEdgePropertyKey,
  LegacyNodePropertyKey,
  LegacyPropertyProjection,
  LegacyPropertyValue,
  NodeRecord,
  VisibleEdgePropertyRecord,
  VisibleNodePropertyRecord,
} from '../../../../src/domain/graph/publicGraphSubstrate.ts';
import {
  CONTENT_MIME_PROPERTY_KEY,
  CONTENT_PROPERTY_KEY,
  CONTENT_SIZE_PROPERTY_KEY,
} from '../../../../src/domain/services/KeyCodec.ts';

describe('legacy property projection graph substrate nouns', () => {
  it('classifies reserved content compatibility keys deterministically', () => {
    const nodeContent = new LegacyNodePropertyKey(CONTENT_PROPERTY_KEY);
    const edgeMime = new LegacyEdgePropertyKey(CONTENT_MIME_PROPERTY_KEY);
    const edgeSize = new LegacyEdgePropertyKey(CONTENT_SIZE_PROPERTY_KEY);
    const nodeUserKey = new LegacyNodePropertyKey('status');

    expect(nodeContent.toString()).toBe(CONTENT_PROPERTY_KEY);
    expect(nodeContent.classification()).toBe('content-oid');
    expect(nodeContent.isContentCompatibilityKey()).toBe(true);
    expect(edgeMime.classification()).toBe('content-mime');
    expect(edgeMime.isContentCompatibilityKey()).toBe(true);
    expect(edgeSize.classification()).toBe('content-size');
    expect(edgeSize.isContentCompatibilityKey()).toBe(true);
    expect(nodeUserKey.classification()).toBe('user');
    expect(nodeUserKey.isContentCompatibilityKey()).toBe(false);
  });

  it('validates node and edge property keys as distinct runtime concepts', () => {
    const nodeKey = new LegacyNodePropertyKey('status');
    const edgeKey = new LegacyEdgePropertyKey('status');

    expect(nodeKey.equals(new LegacyNodePropertyKey('status'))).toBe(true);
    expect(nodeKey.equals(new LegacyNodePropertyKey('owner'))).toBe(false);
    expect(edgeKey.equals(new LegacyEdgePropertyKey('status'))).toBe(true);
    expect(edgeKey.equals(new LegacyEdgePropertyKey('owner'))).toBe(false);
    expect(Object.isFrozen(nodeKey)).toBe(true);
    expect(Object.isFrozen(edgeKey)).toBe(true);
    expect(() => new LegacyNodePropertyKey('')).toThrow(WarpError);
    expect(() => new LegacyEdgePropertyKey('')).toThrow(WarpError);
    expect(() => new LegacyNodePropertyKey('bad\0key')).toThrow(WarpError);
    expect(() => new LegacyEdgePropertyKey('bad\0key')).toThrow(WarpError);
  });

  it('owns property values without exposing mutable source carriers', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const value = new LegacyPropertyValue(bytes);

    bytes[0] = 9;

    const stored = value.toPropValue();
    expect(stored).toBeInstanceOf(Uint8Array);
    expect(Array.from(stored instanceof Uint8Array ? stored : new Uint8Array())).toEqual([1, 2, 3]);
    expect(Object.isFrozen(value)).toBe(true);
    // @ts-expect-error exercising runtime validation
    expect(() => new LegacyPropertyValue(new InvalidPropertyCarrier())).toThrow(WarpError);
  });

  it('keeps node and edge visible property records separate', () => {
    const nodeOwner = NodeRecord.fromLegacyNodeId('node:1');
    const edgeOwner = EdgeRecord.fromLegacyEdge({ from: 'node:1', to: 'node:2', label: 'rel' });
    const nodeKey = new LegacyNodePropertyKey('status');
    const edgeKey = new LegacyEdgePropertyKey('weight');
    const value = new LegacyPropertyValue('ready');

    const nodeRecord = new VisibleNodePropertyRecord({ owner: nodeOwner, key: nodeKey, value });
    const edgeRecord = new VisibleEdgePropertyRecord({ owner: edgeOwner, key: edgeKey, value });

    expect(nodeRecord.owner).toBe(nodeOwner);
    expect(nodeRecord.key).toBe(nodeKey);
    expect(nodeRecord.value).toBe(value);
    expect(edgeRecord.owner).toBe(edgeOwner);
    expect(edgeRecord.key).toBe(edgeKey);
    expect(edgeRecord.value).toBe(value);
    expect(Object.isFrozen(nodeRecord)).toBe(true);
    expect(Object.isFrozen(edgeRecord)).toBe(true);
    // @ts-expect-error exercising runtime validation
    expect(() => new VisibleNodePropertyRecord({ owner: edgeOwner, key: nodeKey, value })).toThrow(WarpError);
    // @ts-expect-error exercising runtime validation
    expect(() => new VisibleEdgePropertyRecord({ owner: nodeOwner, key: edgeKey, value })).toThrow(WarpError);
  });

  it('groups visible property records by runtime owner identity', () => {
    const nodeOwner = NodeRecord.fromLegacyNodeId('node:1');
    const otherNode = NodeRecord.fromLegacyNodeId('node:2');
    const edgeOwner = EdgeRecord.fromLegacyEdge({ from: 'node:1', to: 'node:2', label: 'rel' });
    const otherEdge = EdgeRecord.fromLegacyEdge({ from: 'node:2', to: 'node:1', label: 'rel' });
    const nodeRecord = new VisibleNodePropertyRecord({
      owner: nodeOwner,
      key: new LegacyNodePropertyKey('status'),
      value: new LegacyPropertyValue('ready'),
    });
    const edgeRecord = new VisibleEdgePropertyRecord({
      owner: edgeOwner,
      key: new LegacyEdgePropertyKey('weight'),
      value: new LegacyPropertyValue(3),
    });

    const projection = new LegacyPropertyProjection({
      nodeProperties: [nodeRecord],
      edgeProperties: [edgeRecord],
    });

    expect(projection.nodeProperties).toEqual([nodeRecord]);
    expect(projection.edgeProperties).toEqual([edgeRecord]);
    expect(projection.propertiesForNode(nodeOwner)).toEqual([nodeRecord]);
    expect(projection.propertiesForNode(otherNode)).toEqual([]);
    expect(projection.propertiesForEdge(edgeOwner)).toEqual([edgeRecord]);
    expect(projection.propertiesForEdge(otherEdge)).toEqual([]);
    expect(Object.isFrozen(projection)).toBe(true);
    expect(Object.isFrozen(projection.nodeProperties)).toBe(true);
    expect(Object.isFrozen(projection.edgeProperties)).toBe(true);
  });
});

class InvalidPropertyCarrier {}
