import { describe, expect, it, vi } from 'vitest';

import {
  planVisibleStateTransfer,
  VISIBLE_STATE_TRANSFER_PLAN_VERSION,
} from '../../../../src/domain/services/transfer/VisibleStateTransferPlanner.ts';
import { CONTENT_PROPERTY_KEY } from '../../../../src/domain/services/KeyCodec.ts';

/**
 * @param {string} from
 * @param {string} to
 * @param {string} label
 * @returns {string}
 */
function makeEdgeKey(from, to, label) {
  return `${from}\0${to}\0${label}`;
}

/**
 * @param {{ nodes: string[], edges: Array<{from: string, to: string, label: string}>, nodeProps?: Record<string, unknown>, edgeProps?: Record<string, unknown>, nodeContentMeta?: Record<string, unknown>, edgeContentMeta?: Record<string, unknown> }} opts
 * @returns {any}
 */
function createReader({
  nodes,
  edges,
  nodeProps = {},
  edgeProps = {},
  nodeContentMeta = {},
  edgeContentMeta = {},
}) {
  return {
    getNodes() {
      return [...nodes];
    },
    getEdges() {
      return edges.map((/** @type {any} */ edge) => ({ ...edge }));
    },
    getNodeProps(/** @type {string} */ nodeId) {
      return (nodeProps)[nodeId] ?? null;
    },
    getEdgeProps(/** @type {string} */ from, /** @type {string} */ to, /** @type {string} */ label) {
      return (edgeProps)[makeEdgeKey(from, to, label)] ?? null;
    },
    getNodeContentMeta(/** @type {string} */ nodeId) {
      return (nodeContentMeta)[nodeId] ?? null;
    },
    getEdgeContentMeta(/** @type {string} */ from, /** @type {string} */ to, /** @type {string} */ label) {
      return (edgeContentMeta)[makeEdgeKey(from, to, label)] ?? null;
    },
  };
}

describe('VisibleStateTransferPlanner', () => {
  it('plans deterministic node, edge, property, and content transfer operations', async () => {
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
        beta: { oid: 'node-beta', mime: 'text/plain', size: 4 },
      },
      edgeContentMeta: {
        [newEdgeKey]: { oid: 'edge-new', mime: 'application/octet-stream', size: 3 },
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
        alpha: { oid: 'node-alpha-old', mime: 'text/plain', size: 8 },
      },
      edgeContentMeta: {
        [sharedEdgeKey]: { oid: 'edge-shared-old', mime: 'application/octet-stream', size: 5 },
      },
    });

    const loadNodeContent = vi.fn(async (nodeId) => {
      return new TextEncoder().encode(`node:${nodeId}`);
    });
    const loadEdgeContent = vi.fn(async (edge) => {
      return new TextEncoder().encode(`edge:${edge.from}->${edge.to}:${edge.label}`);
    });

    const plan = await planVisibleStateTransfer(sourceReader, targetReader, {
      loadNodeContent,
      loadEdgeContent,
    });

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
        content: new TextEncoder().encode('node:beta'),
        contentOid: 'node-beta',
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
        content: new TextEncoder().encode('edge:alpha->beta:fresh'),
        contentOid: 'edge-new',
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

    expect(loadNodeContent).toHaveBeenCalledTimes(1);
    expect(loadNodeContent).toHaveBeenCalledWith('beta', { oid: 'node-beta', mime: 'text/plain', size: 4 });
    expect(loadEdgeContent).toHaveBeenCalledTimes(1);
    expect(loadEdgeContent).toHaveBeenCalledWith(
      { from: 'alpha', to: 'beta', label: 'fresh' },
      { oid: 'edge-new', mime: 'application/octet-stream', size: 3 },
    );
  });

  it('returns an empty plan when source and target visible state already match', async () => {
    const reader = createReader({
      nodes: ['alpha'],
      edges: [{ from: 'alpha', to: 'alpha', label: 'self' }],
      nodeProps: { alpha: { status: 'ready' } },
      edgeProps: { [makeEdgeKey('alpha', 'alpha', 'self')]: { weight: 1 } },
      nodeContentMeta: { alpha: { oid: 'same-node', mime: 'text/plain', size: 4 } },
      edgeContentMeta: { [makeEdgeKey('alpha', 'alpha', 'self')]: { oid: 'same-edge', mime: 'text/plain', size: 4 } },
    });

    const loadNodeContent = vi.fn();
    const loadEdgeContent = vi.fn();

    const plan = await planVisibleStateTransfer(reader, reader, {
      loadNodeContent,
      loadEdgeContent,
    });

    expect(plan.ops).toEqual([]);
    expect(plan.summary.opCount).toBe(0);
    expect(loadNodeContent).not.toHaveBeenCalled();
    expect(loadEdgeContent).not.toHaveBeenCalled();
  });
});
