import { buildRemoveEdgeOps } from '../../../../src/domain/services/transfer/transferShape.ts';
import { expect, it, vi } from 'vitest';
import { planVisibleStateTransfer } from '../../../../src/domain/services/transfer/VisibleStateTransferPlanner.ts';

it('plans large node and edge attachments using handles without opening payloads', () => {
  const source = {
    getNodes: () => ['a', 'b'],
    getEdges: () => [{ from: 'a', to: 'b', label: 'link' }],
    getNodeProps: () => ({}),
    getEdgeProps: () => ({}),
    getNodeContentMeta: (id) => id === 'a' ? { handle: 'node-asset', mime: null, size: 2 ** 32 } : null,
    getEdgeContentMeta: () => ({ handle: 'edge-asset', mime: null, size: 2 ** 32 }),
  };
  const target = {
    ...source,
    getNodes: () => [],
    getEdges: () => [],
    getNodeContentMeta: () => null,
    getEdgeContentMeta: () => null,
  };
  // Poison the old eager-loader seam: planning must not need storage I/O.
  const load = vi.fn(() => { throw new Error('attachment payload must not be loaded while planning'); });
  const plan = planVisibleStateTransfer(source, target, { loadNodeContent: load, loadEdgeContent: load });
  const attachments = plan.ops.filter((op) => op.op.startsWith('attach_'));
  expect(attachments).toEqual([
    { op: 'attach_node_content', nodeId: 'a', contentHandle: 'node-asset', mime: null, size: 2 ** 32 },
    { op: 'attach_edge_content', from: 'a', to: 'b', label: 'link', contentHandle: 'edge-asset', mime: null, size: 2 ** 32 },
  ]);
  expect(load).not.toHaveBeenCalled();
});

it('refuses a missing indexed edge with a domain error', () => {
  expect(() => buildRemoveEdgeOps(['missing'], new Map()))
    .toThrow(expect.objectContaining({ code: 'E_TRANSFER_EDGE_MISSING' }));
});
