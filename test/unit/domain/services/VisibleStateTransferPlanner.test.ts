import type { SnapshotPropValue } from '../../../../src/domain/services/snapshot/SnapshotPropValue.ts';
import type { ContentMeta, EdgeRef, VisibleStateReader } from '../../../../src/domain/services/transfer/transferKeys.ts';

type ReaderFixture = {
  nodes: string[];
  edges: EdgeRef[];
  nodeProps?: Record<string, Record<string, SnapshotPropValue>>;
  edgeProps?: Record<string, Record<string, SnapshotPropValue>>;
  nodeContentMeta?: Record<string, ContentMeta>;
  edgeContentMeta?: Record<string, ContentMeta>;
};

import { describe, expect, it } from 'vitest';

import {
  planVisibleStateTransfer,
  VISIBLE_STATE_TRANSFER_PLAN_VERSION,
} from '../../../../src/domain/services/transfer/VisibleStateTransferPlanner.ts';
import { CONTENT_PROPERTY_KEY } from '../../../../src/domain/services/KeyCodec.ts';

function makeEdgeKey(from: string, to: string, label: string) {
  return `${from}\0${to}\0${label}`;
}

function createReader({
  nodes,
  edges,
  nodeProps = {},
  edgeProps = {},
  nodeContentMeta = {},
  edgeContentMeta = {},
}: ReaderFixture): VisibleStateReader {
  return {
    project() { throw new Error('Transfer planning must not request a full projection'); },
    hasNode(nodeId) { return nodes.includes(nodeId); },
    neighbors() { throw new Error('Transfer planning must not expand neighborhoods'); },
    inspectNode() { throw new Error('Transfer planning must use the selected read seam'); },
    getNodes() {
      return [...nodes];
    },
    getEdges() {
      return edges.map((edge) => ({ ...edge, props: edgeProps[makeEdgeKey(edge.from, edge.to, edge.label)] ?? {} }));
    },
    getNodeProps(nodeId) {
      return (nodeProps)[nodeId] ?? null;
    },
    getEdgeProps(from, to, label) {
      return (edgeProps)[makeEdgeKey(from, to, label)] ?? null;
    },
    getNodeContentMeta(nodeId) {
      return (nodeContentMeta)[nodeId] ?? null;
    },
    getEdgeContentMeta(from, to, label) {
      return (edgeContentMeta)[makeEdgeKey(from, to, label)] ?? null;
    },
  };
}

describe('VisibleStateTransferPlanner', () => {
  it('plans deterministic node, edge, property, and content transfer operations', () => {
    const sharedEdgeKey = makeEdgeKey('alpha', 'alpha', 'shared');
    const newEdgeKey = makeEdgeKey('alpha', 'beta', 'fresh');
    const oldEdgeKey = makeEdgeKey('legacy', 'alpha', 'old');

    const sourceReader = createReader({
      nodes: ['beta', 'alpha'],
      edges: [
        { from: 'alpha', to: 'beta', label: 'fresh' },
        { from: 'alpha', to: 'alpha', label: 'shared' },
      ],
      nodeProps: {
        alpha: {
          stable: 1,
          changed: 'new',
          added: 'present',
          [CONTENT_PROPERTY_KEY]: 'ignored-by-property-diff',
        },
        beta: {
          status: 'beta-ready',
        },
      },
      edgeProps: {
        [sharedEdgeKey]: {
          weight: 2,
        },
        [newEdgeKey]: {
          role: 'fresh',
        },
      },
      nodeContentMeta: {
        beta: { handle: 'node-beta', mime: 'text/plain', size: 4 },
      },
      edgeContentMeta: {
        [newEdgeKey]: { handle: 'edge-new', mime: 'application/octet-stream', size: 3 },
      },
    });

    const targetReader = createReader({
      nodes: ['legacy', 'alpha'],
      edges: [
        { from: 'legacy', to: 'alpha', label: 'old' },
        { from: 'alpha', to: 'alpha', label: 'shared' },
      ],
      nodeProps: {
        alpha: {
          stable: 1,
          changed: 'old',
          removed: 'stale',
          [CONTENT_PROPERTY_KEY]: 'also-ignored',
        },
        legacy: {
          status: 'legacy',
        },
      },
      edgeProps: {
        [sharedEdgeKey]: {
          stale: true,
          weight: 1,
        },
        [oldEdgeKey]: {
          role: 'stale',
        },
      },
      nodeContentMeta: {
        alpha: { handle: 'node-alpha-old', mime: 'text/plain', size: 8 },
      },
      edgeContentMeta: {
        [sharedEdgeKey]: { handle: 'edge-shared-old', mime: 'application/octet-stream', size: 5 },
      },
    });

    const plan = planVisibleStateTransfer(sourceReader, targetReader);

    expect(plan.transferVersion).toBe(VISIBLE_STATE_TRANSFER_PLAN_VERSION);
    expect(plan.ops).toEqual([
      { op: 'add_node', nodeId: 'beta' },
      { op: 'set_node_property', nodeId: 'alpha', key: 'added', value: 'present' },
      { op: 'set_node_property', nodeId: 'alpha', key: 'changed', value: 'new' },
      { op: 'set_node_property', nodeId: 'alpha', key: 'removed', value: null },
      { op: 'set_node_property', nodeId: 'beta', key: 'status', value: 'beta-ready' },
      {
        op: 'clear_node_content',
        nodeId: 'alpha',
      },
      {
        op: 'attach_node_content',
        nodeId: 'beta',

        contentHandle: 'node-beta',
        mime: 'text/plain',
        size: 4,
      },
      { op: 'add_edge', from: 'alpha', to: 'beta', label: 'fresh' },
      { op: 'set_edge_property', from: 'alpha', to: 'beta', label: 'fresh', key: 'role', value: 'fresh' },
      { op: 'set_edge_property', from: 'alpha', to: 'alpha', label: 'shared', key: 'stale', value: null },
      { op: 'set_edge_property', from: 'alpha', to: 'alpha', label: 'shared', key: 'weight', value: 2 },
      {
        op: 'attach_edge_content',
        from: 'alpha',
        to: 'beta',
        label: 'fresh',

        contentHandle: 'edge-new',
        mime: 'application/octet-stream',
        size: 3,
      },
      {
        op: 'clear_edge_content',
        from: 'alpha',
        to: 'alpha',
        label: 'shared',
      },
      { op: 'remove_edge', from: 'legacy', to: 'alpha', label: 'old' },
      { op: 'remove_node', nodeId: 'legacy' },
    ]);

    expect(plan.summary).toEqual({
      opCount: 15,
      addNodeCount: 1,
      removeNodeCount: 1,
      setNodePropertyCount: 3,
      clearNodePropertyCount: 1,
      addEdgeCount: 1,
      removeEdgeCount: 1,
      setEdgePropertyCount: 2,
      clearEdgePropertyCount: 1,
      attachNodeContentCount: 1,
      clearNodeContentCount: 1,
      attachEdgeContentCount: 1,
      clearEdgeContentCount: 1,
    });

  });

  it('returns an empty plan when source and target visible state already match', () => {
    const reader = createReader({
      nodes: ['alpha'],
      edges: [{ from: 'alpha', to: 'alpha', label: 'self' }],
      nodeProps: { alpha: { status: 'ready' } },
      edgeProps: { [makeEdgeKey('alpha', 'alpha', 'self')]: { weight: 1 } },
      nodeContentMeta: { alpha: { handle: 'same-node', mime: 'text/plain', size: 4 } },
      edgeContentMeta: { [makeEdgeKey('alpha', 'alpha', 'self')]: { handle: 'same-edge', mime: 'text/plain', size: 4 } },
    });

    const plan = planVisibleStateTransfer(reader, reader);

    expect(plan.ops).toEqual([]);
    expect(plan.summary.opCount).toBe(0);
  });
});
