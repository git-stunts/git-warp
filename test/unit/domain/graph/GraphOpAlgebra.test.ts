import { describe, expect, it } from 'vitest';

import AttachmentKey from '../../../../src/domain/graph/AttachmentKey.ts';
import AttachmentRecord from '../../../../src/domain/graph/AttachmentRecord.ts';
import AttachmentSchemaVersion from '../../../../src/domain/graph/AttachmentSchemaVersion.ts';
import ContentAttachmentHandle from '../../../../src/domain/graph/ContentAttachmentHandle.ts';
import ContentAttachmentPayload from '../../../../src/domain/graph/ContentAttachmentPayload.ts';
import ContentAttachmentRecord from '../../../../src/domain/graph/ContentAttachmentRecord.ts';
import EdgeRecord from '../../../../src/domain/graph/EdgeRecord.ts';
import GraphAttachmentSetOp from '../../../../src/domain/graph/GraphAttachmentSetOp.ts';
import GraphContentAttachmentSetOp from '../../../../src/domain/graph/GraphContentAttachmentSetOp.ts';
import GraphEdgeRecordSetOp from '../../../../src/domain/graph/GraphEdgeRecordSetOp.ts';
import GraphEdgePropertySetOp from '../../../../src/domain/graph/GraphEdgePropertySetOp.ts';
import GraphNodeRecordSetOp from '../../../../src/domain/graph/GraphNodeRecordSetOp.ts';
import GraphNodePropertySetOp from '../../../../src/domain/graph/GraphNodePropertySetOp.ts';
import GraphOpAlgebra from '../../../../src/domain/graph/GraphOpAlgebra.ts';
import LegacyEdgePropertyKey from '../../../../src/domain/graph/LegacyEdgePropertyKey.ts';
import LegacyNodePropertyKey from '../../../../src/domain/graph/LegacyNodePropertyKey.ts';
import LegacyPropertyValue from '../../../../src/domain/graph/LegacyPropertyValue.ts';
import NodeRecord from '../../../../src/domain/graph/NodeRecord.ts';
import VisibleEdgePropertyRecord from '../../../../src/domain/graph/VisibleEdgePropertyRecord.ts';
import VisibleNodePropertyRecord from '../../../../src/domain/graph/VisibleNodePropertyRecord.ts';

describe('GraphOpAlgebra', () => {
  it('names graph node, edge, attachment, content, and property operations as runtime-backed values', () => {
    const nodeRecord = NodeRecord.fromLegacyNodeId('node:a');
    const edgeRecord = EdgeRecord.fromLegacyEdge({ from: 'node:a', to: 'node:b', label: 'knows' });
    const attachmentRecord = new AttachmentRecord({
      owner: nodeRecord,
      key: new AttachmentKey('title'),
      value: 'A',
      schemaVersion: AttachmentSchemaVersion.current(),
    });
    const contentRecord = new ContentAttachmentRecord({
      owner: nodeRecord,
      payload: new ContentAttachmentPayload({
        handle: new ContentAttachmentHandle('asset-a'),
        mime: null,
        size: null,
      }),
    });
    const nodePropertyRecord = new VisibleNodePropertyRecord({
      owner: nodeRecord,
      key: new LegacyNodePropertyKey('title'),
      value: new LegacyPropertyValue('A'),
    });
    const edgePropertyRecord = new VisibleEdgePropertyRecord({
      owner: edgeRecord,
      key: new LegacyEdgePropertyKey('weight'),
      value: new LegacyPropertyValue(7),
    });

    const nodeOp = new GraphNodeRecordSetOp({ record: nodeRecord });
    const edgeOp = new GraphEdgeRecordSetOp({ record: edgeRecord });
    const attachmentOp = new GraphAttachmentSetOp({ record: attachmentRecord });
    const contentOp = new GraphContentAttachmentSetOp({ record: contentRecord });
    const nodePropertyOp = new GraphNodePropertySetOp({ record: nodePropertyRecord });
    const edgePropertyOp = new GraphEdgePropertySetOp({ record: edgePropertyRecord });
    const algebra = new GraphOpAlgebra({
      operations: [nodeOp, edgeOp, attachmentOp, contentOp, nodePropertyOp, edgePropertyOp],
    });

    expect(algebra.operations.map((operation) => operation.type)).toEqual([
      'GraphNodeRecordSet',
      'GraphEdgeRecordSet',
      'GraphAttachmentSet',
      'GraphContentAttachmentSet',
      'GraphNodePropertySet',
      'GraphEdgePropertySet',
    ]);
    expect(algebra.operations[0]).toBeInstanceOf(GraphNodeRecordSetOp);
    expect(algebra.operations[1]).toBeInstanceOf(GraphEdgeRecordSetOp);
    expect(algebra.operations[2]).toBeInstanceOf(GraphAttachmentSetOp);
    expect(algebra.operations[3]).toBeInstanceOf(GraphContentAttachmentSetOp);
    expect(algebra.operations[4]).toBeInstanceOf(GraphNodePropertySetOp);
    expect(algebra.operations[5]).toBeInstanceOf(GraphEdgePropertySetOp);
    expect(Object.isFrozen(algebra.operations)).toBe(true);
    expect(Object.isFrozen(algebra)).toBe(true);
  });

  it('rejects operation records with fake shapes', () => {
    expect(() => {
      // @ts-expect-error exercising runtime validation
      new GraphNodeRecordSetOp({ record: { id: 'node:a' } });
    }).toThrow(/NodeRecord/);
    expect(() => {
      // @ts-expect-error exercising runtime validation
      new GraphEdgeRecordSetOp({ record: { id: 'edge:a' } });
    }).toThrow(/EdgeRecord/);
    expect(() => {
      // @ts-expect-error exercising runtime validation
      new GraphAttachmentSetOp({ record: { key: 'title' } });
    }).toThrow(/AttachmentRecord/);
    expect(() => {
      // @ts-expect-error exercising runtime validation
      new GraphContentAttachmentSetOp({ record: { payload: 'oid-a' } });
    }).toThrow(/ContentAttachmentRecord/);
    expect(() => {
      // @ts-expect-error exercising runtime validation
      new GraphNodePropertySetOp({ record: { key: 'title' } });
    }).toThrow(/VisibleNodePropertyRecord/);
    expect(() => {
      // @ts-expect-error exercising runtime validation
      new GraphEdgePropertySetOp({ record: { key: 'weight' } });
    }).toThrow(/VisibleEdgePropertyRecord/);
    expect(() => {
      // @ts-expect-error exercising runtime validation
      new GraphOpAlgebra({ operations: [{ type: 'NodePropSet' }] });
    }).toThrow(/graph operation/);
  });

  it('rejects missing envelopes and invalid operation collections', () => {
    expect(() => {
      // @ts-expect-error exercising runtime validation
      new GraphNodeRecordSetOp(undefined);
    }).toThrow(/fields must be provided/);
    expect(() => {
      // @ts-expect-error exercising runtime validation
      new GraphEdgeRecordSetOp(null);
    }).toThrow(/fields must be provided/);
    expect(() => {
      // @ts-expect-error exercising runtime validation
      new GraphAttachmentSetOp(undefined);
    }).toThrow(/fields must be provided/);
    expect(() => {
      // @ts-expect-error exercising runtime validation
      new GraphContentAttachmentSetOp(null);
    }).toThrow(/fields must be provided/);
    expect(() => {
      // @ts-expect-error exercising runtime validation
      new GraphNodePropertySetOp(undefined);
    }).toThrow(/fields must be provided/);
    expect(() => {
      // @ts-expect-error exercising runtime validation
      new GraphEdgePropertySetOp(null);
    }).toThrow(/fields must be provided/);
    expect(() => {
      // @ts-expect-error exercising runtime validation
      new GraphOpAlgebra(null);
    }).toThrow(/fields must be provided/);
    expect(() => {
      // @ts-expect-error exercising runtime validation
      new GraphOpAlgebra({ operations: 'NodePropSet' });
    }).toThrow(/operations must be an array/);
  });
});
