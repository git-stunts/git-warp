import { describe, expect, it } from 'vitest';

import AttachmentKey from '../../../../src/domain/graph/AttachmentKey.ts';
import AttachmentRecord from '../../../../src/domain/graph/AttachmentRecord.ts';
import AttachmentSchemaVersion from '../../../../src/domain/graph/AttachmentSchemaVersion.ts';
import EdgeRecord from '../../../../src/domain/graph/EdgeRecord.ts';
import NodeRecord from '../../../../src/domain/graph/NodeRecord.ts';
import WarpError from '../../../../src/domain/errors/WarpError.ts';

describe('AttachmentRecord graph substrate nouns', () => {
  it('validates attachment keys as runtime-backed slot identifiers', () => {
    const key = new AttachmentKey('_content');

    expect(key.toString()).toBe('_content');
    expect(key.equals(new AttachmentKey('_content'))).toBe(true);
    expect(key.equals(new AttachmentKey('title'))).toBe(false);
    expect(Object.isFrozen(key)).toBe(true);
    expect(() => new AttachmentKey('')).toThrow(WarpError);
    expect(() => new AttachmentKey('bad\0key')).toThrow(WarpError);
  });

  it('validates attachment schema versions', () => {
    const version = new AttachmentSchemaVersion(1);

    expect(version.toNumber()).toBe(1);
    expect(version.equals(new AttachmentSchemaVersion(1))).toBe(true);
    expect(version.equals(new AttachmentSchemaVersion(2))).toBe(false);
    expect(Object.isFrozen(version)).toBe(true);
    expect(() => new AttachmentSchemaVersion(0)).toThrow(WarpError);
    expect(() => new AttachmentSchemaVersion(1.5)).toThrow(WarpError);
  });

  it('records node-owned attachment payload slots', () => {
    const owner = NodeRecord.fromLegacyNodeId('node:a');
    const record = new AttachmentRecord({
      owner,
      key: new AttachmentKey('title'),
      value: 'hello',
      schemaVersion: new AttachmentSchemaVersion(1),
    });

    expect(record.owner).toBe(owner);
    expect(record.key.toString()).toBe('title');
    expect(record.value).toBe('hello');
    expect(record.schemaVersion.toNumber()).toBe(1);
    expect(record.isNodeAttachment()).toBe(true);
    expect(record.isEdgeAttachment()).toBe(false);
    expect(Object.isFrozen(record)).toBe(true);
  });

  it('records edge-owned attachment payload slots', () => {
    const owner = EdgeRecord.fromLegacyEdge({ from: 'node:a', to: 'node:b', label: 'knows' });
    const record = new AttachmentRecord({
      owner,
      key: new AttachmentKey('weight'),
      value: 7,
      schemaVersion: new AttachmentSchemaVersion(1),
    });

    expect(record.owner).toBe(owner);
    expect(record.key.toString()).toBe('weight');
    expect(record.value).toBe(7);
    expect(record.isNodeAttachment()).toBe(false);
    expect(record.isEdgeAttachment()).toBe(true);
  });

  it('rejects invalid attachment record envelopes', () => {
    const owner = NodeRecord.fromLegacyNodeId('node:a');

    expect(() => {
      // @ts-expect-error exercising runtime validation
      new AttachmentRecord(null);
    }).toThrow(WarpError);
    expect(() => {
      new AttachmentRecord({
        // @ts-expect-error exercising runtime validation
        owner: {},
        key: new AttachmentKey('title'),
        value: 'hello',
        schemaVersion: new AttachmentSchemaVersion(1),
      });
    }).toThrow(WarpError);
    expect(() => {
      new AttachmentRecord({
        owner,
        // @ts-expect-error exercising runtime validation
        key: {},
        value: 'hello',
        schemaVersion: new AttachmentSchemaVersion(1),
      });
    }).toThrow(WarpError);
    expect(() => {
      new AttachmentRecord({
        owner,
        key: new AttachmentKey('title'),
        // @ts-expect-error exercising runtime validation
        value: Symbol('invalid'),
        schemaVersion: new AttachmentSchemaVersion(1),
      });
    }).toThrow(WarpError);
    expect(() => {
      new AttachmentRecord({
        owner,
        key: new AttachmentKey('title'),
        value: 'hello',
        // @ts-expect-error exercising runtime validation
        schemaVersion: {},
      });
    }).toThrow(WarpError);
  });
});
