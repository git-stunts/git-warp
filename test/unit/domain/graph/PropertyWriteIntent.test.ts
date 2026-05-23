import { describe, expect, it } from 'vitest';

import EdgePropertyWriteIntent from '../../../../src/domain/graph/EdgePropertyWriteIntent.ts';
import NodePropertyWriteIntent from '../../../../src/domain/graph/NodePropertyWriteIntent.ts';

describe('property write intents', () => {
  it('names node property writes as frozen runtime-backed intents', () => {
    const source = { nested: ['ready'] };
    const intent = NodePropertyWriteIntent.fromLegacyProperty('node:1', 'status', source);
    source.nested.push('mutated');

    expect(intent.nodeId()).toBe('node:1');
    expect(intent.propertyKey()).toBe('status');
    expect(intent.propertyValue()).toEqual({ nested: ['ready'] });
    expect(Object.isFrozen(intent)).toBe(true);
  });

  it('names edge property writes as frozen runtime-backed intents', () => {
    const intent = EdgePropertyWriteIntent.fromLegacyProperty({
      from: 'node:1',
      to: 'node:2',
      label: 'rel',
      key: 'weight',
      value: 3,
    });

    expect(intent.edgeTarget()).toEqual({
      from: 'node:1',
      to: 'node:2',
      label: 'rel',
    });
    expect(intent.propertyKey()).toBe('weight');
    expect(intent.propertyValue()).toBe(3);
    expect(Object.isFrozen(intent)).toBe(true);
  });

  it('rejects malformed node property write carriers', () => {
    expect(() => NodePropertyWriteIntent.fromLegacyProperty('', 'status', 'ready')).toThrow(/NodeId/);
    expect(() => NodePropertyWriteIntent.fromLegacyProperty('node:1', '', 'ready')).toThrow(
      /LegacyNodePropertyKey/,
    );
    expect(() => NodePropertyWriteIntent.fromLegacyProperty('node\0bad', 'status', 'ready')).toThrow(
      /NodeId/,
    );
    expect(() => NodePropertyWriteIntent.fromLegacyProperty('node:1', 'bad\0key', 'ready')).toThrow(
      /LegacyNodePropertyKey/,
    );
    expect(() => {
      // @ts-expect-error exercising runtime rejection of invalid value carriers
      NodePropertyWriteIntent.fromLegacyProperty('node:1', 'status', new InvalidPropertyCarrier());
    }).toThrow(/LegacyPropertyValue/);
  });

  it('rejects malformed edge property write carriers', () => {
    expect(() => EdgePropertyWriteIntent.fromLegacyProperty({
      from: '',
      to: 'node:2',
      label: 'rel',
      key: 'weight',
      value: 3,
    })).toThrow(/NodeId/);
    expect(() => EdgePropertyWriteIntent.fromLegacyProperty({
      from: 'node:1',
      to: 'node\0bad',
      label: 'rel',
      key: 'weight',
      value: 3,
    })).toThrow(/EdgeId/);
    expect(() => EdgePropertyWriteIntent.fromLegacyProperty({
      from: 'node:1',
      to: 'node:2',
      label: '',
      key: 'weight',
      value: 3,
    })).toThrow(/EdgeTypeId/);
    expect(() => EdgePropertyWriteIntent.fromLegacyProperty({
      from: 'node:1',
      to: 'node:2',
      label: 'rel',
      key: '',
      value: 3,
    })).toThrow(/LegacyEdgePropertyKey/);
  });
});

class InvalidPropertyCarrier {}
