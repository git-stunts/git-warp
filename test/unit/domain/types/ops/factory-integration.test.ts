/**
 * Tests that Op class constructor produce Op class instances
 * and that OpNormalizer returns class instances.
 */
import { describe, it, expect } from 'vitest';
import { Dot } from '../../../../../src/domain/crdt/Dot.ts';
import Op from '../../../../../src/domain/types/ops/Op.ts';
import NodeAdd from '../../../../../src/domain/types/ops/NodeAdd.ts';
import NodeRemove from '../../../../../src/domain/types/ops/NodeRemove.ts';
import EdgeAdd from '../../../../../src/domain/types/ops/EdgeAdd.ts';
import EdgeRemove from '../../../../../src/domain/types/ops/EdgeRemove.ts';
import NodePropSet from '../../../../../src/domain/types/ops/NodePropSet.ts';
import EdgePropSet from '../../../../../src/domain/types/ops/EdgePropSet.ts';
import PropSetClass from '../../../../../src/domain/types/ops/PropSet.ts';
/** @param {string} node @param {import('../../../../../src/domain/crdt/Dot.ts').Dot} dot */
function createNodeAddV2(node, dot) { return new NodeAdd(node, dot); }
/** @param {string} node @param {string[]} observedDots */
function createNodeRemoveV2(node, observedDots) { return new NodeRemove(node, observedDots); }
/** @param {string} from @param {string} to @param {string} label @param {import('../../../../../src/domain/crdt/Dot.ts').Dot} dot */
function createEdgeAddV2(from, to, label, dot) { return new EdgeAdd({ from, to, label, dot }); }
/** @param {string} from @param {string} to @param {string} label @param {string[]} observedDots */
function createEdgeRemoveV2(from, to, label, observedDots) { return new EdgeRemove({ from, to, label, observedDots }); }
/** @param {string} node @param {string} key @param {unknown} value */
function createPropSetV2(node, key, value) { return new PropSetClass(node, key, value); }
/** @param {string} node @param {string} key @param {unknown} value */
function createNodePropSetV2(node, key, value) { return new NodePropSet(node, key, value); }
/** @param {string} from @param {string} to @param {string} label @param {string} key @param {unknown} value */
function createEdgePropSetV2(from, to, label, key, value) { return new EdgePropSet({ from, to, label, key, value }); }
import { normalizeRawOp, lowerCanonicalOp } from '../../../../../src/domain/services/OpNormalizer.ts';

describe('Op class constructor produce Op class instances', () => {
  it('createNodeAddV2 returns a NodeAdd instance', () => {
    const dot = new Dot('alice', 1);
    const op = createNodeAddV2('user:alice', dot);

    expect(op).toBeInstanceOf(Op);
    expect(op).toBeInstanceOf(NodeAdd);
    expect(op.type).toBe('NodeAdd');
    expect(op.node).toBe('user:alice');
    expect(op.dot).toBe(dot);
  });

  it('createNodeRemoveV2 returns a NodeRemove instance', () => {
    const op = createNodeRemoveV2('user:alice', ['alice:1']);

    expect(op).toBeInstanceOf(Op);
    expect(op).toBeInstanceOf(NodeRemove);
    expect(op.type).toBe('NodeRemove');
    expect(op.node).toBe('user:alice');
    expect(op.observedDots).toEqual(['alice:1']);
  });

  it('createEdgeAddV2 returns an EdgeAdd instance', () => {
    const dot = new Dot('alice', 1);
    const op = createEdgeAddV2('n1', 'n2', 'rel', dot);

    expect(op).toBeInstanceOf(Op);
    expect(op).toBeInstanceOf(EdgeAdd);
    expect(op.type).toBe('EdgeAdd');
    expect(op.from).toBe('n1');
    expect(op.to).toBe('n2');
    expect(op.label).toBe('rel');
    expect(op.dot).toBe(dot);
  });

  it('createEdgeRemoveV2 returns an EdgeRemove instance', () => {
    const op = createEdgeRemoveV2('n1', 'n2', 'rel', ['w:1']);

    expect(op).toBeInstanceOf(Op);
    expect(op).toBeInstanceOf(EdgeRemove);
    expect(op.type).toBe('EdgeRemove');
    expect(op.from).toBe('n1');
    expect(op.to).toBe('n2');
    expect(op.label).toBe('rel');
    expect(op.observedDots).toEqual(['w:1']);
  });

  it('createPropSetV2 returns a PropSet instance', () => {
    const op = createPropSetV2('user:alice', 'name', 'Alice');

    expect(op).toBeInstanceOf(Op);
    expect(op).toBeInstanceOf(PropSetClass);
    expect(op.type).toBe('PropSet');
    expect(op.node).toBe('user:alice');
    expect(op.key).toBe('name');
    expect(op.value).toBe('Alice');
  });

  it('createNodePropSetV2 returns a NodePropSet instance', () => {
    const op = createNodePropSetV2('user:alice', 'name', 'Alice');

    expect(op).toBeInstanceOf(Op);
    expect(op).toBeInstanceOf(NodePropSet);
    expect(op.type).toBe('NodePropSet');
    expect(op.node).toBe('user:alice');
    expect(op.key).toBe('name');
    expect(op.value).toBe('Alice');
  });

  it('createEdgePropSetV2 returns an EdgePropSet instance', () => {
    const op = createEdgePropSetV2('n1', 'n2', 'rel', 'weight', 42);

    expect(op).toBeInstanceOf(Op);
    expect(op).toBeInstanceOf(EdgePropSet);
    expect(op.type).toBe('EdgePropSet');
    expect(op.from).toBe('n1');
    expect(op.to).toBe('n2');
    expect(op.label).toBe('rel');
    expect(op.key).toBe('weight');
    expect(op.value).toBe(42);
  });
});

describe('OpNormalizer returns Op class instances', () => {
  it('normalizeRawOp passes NodeAdd through as-is', () => {
    const dot = new Dot('w', 1);
    const raw = createNodeAddV2('n1', dot);
    const canonical = normalizeRawOp(raw);

    expect(canonical).toBe(raw);
    expect(canonical).toBeInstanceOf(NodeAdd);
  });

  it('normalizeRawOp converts PropSet (node) to NodePropSet instance', () => {
    const raw = createPropSetV2('user:alice', 'name', 'Alice');
    const canonical = normalizeRawOp(raw);

    expect(canonical).toBeInstanceOf(NodePropSet);
    expect(canonical.type).toBe('NodePropSet');
    if (canonical.type === 'NodePropSet') {
      expect(canonical.node).toBe('user:alice');
      expect(canonical.key).toBe('name');
      expect(canonical.value).toBe('Alice');
    }
  });

  it('normalizeRawOp converts PropSet (edge) to EdgePropSet instance', () => {
    const raw = createPropSetV2('\x01n1\x00n2\x00rel', 'weight', 42);
    const canonical = normalizeRawOp(raw);

    expect(canonical).toBeInstanceOf(EdgePropSet);
    expect(canonical.type).toBe('EdgePropSet');
    if (canonical.type === 'EdgePropSet') {
      expect(canonical.from).toBe('n1');
      expect(canonical.to).toBe('n2');
      expect(canonical.label).toBe('rel');
      expect(canonical.key).toBe('weight');
      expect(canonical.value).toBe(42);
    }
  });

  it('lowerCanonicalOp converts NodePropSet to PropSet instance', () => {
    const canonical = createNodePropSetV2('user:alice', 'name', 'Alice');
    const raw = lowerCanonicalOp((canonical));

    expect(raw).toBeInstanceOf(PropSetClass);
    expect(raw.type).toBe('PropSet');
    if (raw.type === 'PropSet') {
      expect(raw.node).toBe('user:alice');
      expect(raw.key).toBe('name');
      expect(raw.value).toBe('Alice');
    }
  });

  it('lowerCanonicalOp converts EdgePropSet to PropSet instance', () => {
    const canonical = createEdgePropSetV2('n1', 'n2', 'rel', 'weight', 42);
    const raw = lowerCanonicalOp((canonical));

    expect(raw).toBeInstanceOf(PropSetClass);
    expect(raw.type).toBe('PropSet');
    if (raw.type === 'PropSet') {
      expect(raw.node).toContain('\x01');
      expect(raw.key).toBe('weight');
      expect(raw.value).toBe(42);
    }
  });

  it('lowerCanonicalOp passes NodeAdd through as-is', () => {
    const dot = new Dot('w', 1);
    const canonical = createNodeAddV2('n1', dot);
    const raw = lowerCanonicalOp((canonical));

    expect(raw).toBe(canonical);
    expect(raw).toBeInstanceOf(NodeAdd);
  });

  it('round-trip: PropSet → normalize → lower → PropSet with same data', () => {
    const original = createPropSetV2('user:alice', 'name', 'Alice');
    const canonical = normalizeRawOp(original);
    const lowered = lowerCanonicalOp((canonical as any));

    expect(lowered).toBeInstanceOf(PropSetClass);
    expect(lowered.type).toBe('PropSet');
    if (lowered.type === 'PropSet') {
      expect(lowered.node).toBe('user:alice');
      expect(lowered.key).toBe('name');
      expect(lowered.value).toBe('Alice');
    }
  });

  it('round-trip: edge PropSet → normalize → lower → PropSet with same encoding', () => {
    const original = createPropSetV2('\x01n1\x00n2\x00rel', 'weight', 42);
    const canonical = normalizeRawOp(original);
    const lowered = lowerCanonicalOp((canonical as any));

    expect(lowered).toBeInstanceOf(PropSetClass);
    expect(lowered.type).toBe('PropSet');
    if (lowered.type === 'PropSet') {
      expect(lowered.node).toBe(original.node);
      expect(lowered.key).toBe('weight');
      expect(lowered.value).toBe(42);
    }
  });
});
