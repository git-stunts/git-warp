import { describe, expect, it } from 'vitest';

import AttachmentKey from '../../../../src/domain/graph/AttachmentKey.ts';
import AttachmentRecord from '../../../../src/domain/graph/AttachmentRecord.ts';
import AttachmentSchemaVersion from '../../../../src/domain/graph/AttachmentSchemaVersion.ts';
import EdgeRecord from '../../../../src/domain/graph/EdgeRecord.ts';
import GraphAttachmentSetOp from '../../../../src/domain/graph/GraphAttachmentSetOp.ts';
import GraphEdgeRecordSetOp from '../../../../src/domain/graph/GraphEdgeRecordSetOp.ts';
import GraphNodeRecordSetOp from '../../../../src/domain/graph/GraphNodeRecordSetOp.ts';
import GraphOpAlgebra from '../../../../src/domain/graph/GraphOpAlgebra.ts';
import NodeRecord from '../../../../src/domain/graph/NodeRecord.ts';

describe('GraphOpAlgebra', () => {
  it('names graph node, edge, and attachment operations as runtime-backed values', () => {
    const nodeRecord = NodeRecord.fromLegacyNodeId('node:a');
    const edgeRecord = EdgeRecord.fromLegacyEdge({ from: 'node:a', to: 'node:b', label: 'knows' });
    const attachmentRecord = new AttachmentRecord({
      owner: nodeRecord,
      key: new AttachmentKey('title'),
      value: 'A',
      schemaVersion: AttachmentSchemaVersion.current(),
    });

    const nodeOp = new GraphNodeRecordSetOp({ record: nodeRecord });
    const edgeOp = new GraphEdgeRecordSetOp({ record: edgeRecord });
    const attachmentOp = new GraphAttachmentSetOp({ record: attachmentRecord });
    const algebra = new GraphOpAlgebra({ operations: [nodeOp, edgeOp, attachmentOp] });

    expect(algebra.operations.map((operation) => operation.type)).toEqual([
      'GraphNodeRecordSet',
      'GraphEdgeRecordSet',
      'GraphAttachmentSet',
    ]);
    expect(algebra.operations[0]).toBeInstanceOf(GraphNodeRecordSetOp);
    expect(algebra.operations[1]).toBeInstanceOf(GraphEdgeRecordSetOp);
    expect(algebra.operations[2]).toBeInstanceOf(GraphAttachmentSetOp);
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
      new GraphOpAlgebra(null);
    }).toThrow(/fields must be provided/);
    expect(() => {
      // @ts-expect-error exercising runtime validation
      new GraphOpAlgebra({ operations: 'NodePropSet' });
    }).toThrow(/operations must be an array/);
  });
});
