/**
 * Tests that WarpTypesV2 factory functions produce Op class instances
 * and that OpNormalizer returns class instances.
 */
import { describe, it, expect } from 'vitest';
import { Dot } from '../../../../../src/domain/crdt/Dot.js';
import Op from '../../../../../src/domain/types/ops/Op.js';
import NodeAdd from '../../../../../src/domain/types/ops/NodeAdd.js';
import NodeRemove from '../../../../../src/domain/types/ops/NodeRemove.js';
import EdgeAdd from '../../../../../src/domain/types/ops/EdgeAdd.js';
import EdgeRemove from '../../../../../src/domain/types/ops/EdgeRemove.js';
import NodePropSet from '../../../../../src/domain/types/ops/NodePropSet.js';
import EdgePropSet from '../../../../../src/domain/types/ops/EdgePropSet.js';
import PropSetClass from '../../../../../src/domain/types/ops/PropSet.js';
import {
  createNodeAddV2,
  createNodeRemoveV2,
  createEdgeAddV2,
  createEdgeRemoveV2,
  createPropSetV2,
  createNodePropSetV2,
  createEdgePropSetV2,
} from '../../../../../src/domain/types/WarpTypesV2.js';
import { normalizeRawOp, lowerCanonicalOp } from '../../../../../src/domain/services/OpNormalizer.js';

describe('WarpTypesV2 factory functions produce Op class instances', () => {
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
    const nodeProp = /** @type {NodePropSet} */ (canonical);
    expect(nodeProp.type).toBe('NodePropSet');
    expect(nodeProp.node).toBe('user:alice');
    expect(nodeProp.key).toBe('name');
    expect(nodeProp.value).toBe('Alice');
  });

  it('normalizeRawOp converts PropSet (edge) to EdgePropSet instance', () => {
    const raw = createPropSetV2('\x01n1\x00n2\x00rel', 'weight', 42);
    const canonical = normalizeRawOp(raw);

    expect(canonical).toBeInstanceOf(EdgePropSet);
    expect(canonical.type).toBe('EdgePropSet');
    expect(canonical.from).toBe('n1');
    expect(canonical.to).toBe('n2');
    expect(canonical.label).toBe('rel');
    expect(canonical.key).toBe('weight');
    expect(canonical.value).toBe(42);
  });

  it('lowerCanonicalOp converts NodePropSet to PropSet instance', () => {
    const canonical = createNodePropSetV2('user:alice', 'name', 'Alice');
    const raw = lowerCanonicalOp(canonical);

    expect(raw).toBeInstanceOf(PropSetClass);
    expect(raw.type).toBe('PropSet');
    expect(raw.node).toBe('user:alice');
    expect(raw.key).toBe('name');
    expect(raw.value).toBe('Alice');
  });

  it('lowerCanonicalOp converts EdgePropSet to PropSet instance', () => {
    const canonical = createEdgePropSetV2('n1', 'n2', 'rel', 'weight', 42);
    const raw = lowerCanonicalOp(canonical);

    expect(raw).toBeInstanceOf(PropSetClass);
    expect(raw.type).toBe('PropSet');
    expect(raw.node).toContain('\x01');
    expect(raw.key).toBe('weight');
    expect(raw.value).toBe(42);
  });

  it('lowerCanonicalOp passes NodeAdd through as-is', () => {
    const dot = new Dot('w', 1);
    const canonical = createNodeAddV2('n1', dot);
    const raw = lowerCanonicalOp(canonical);

    expect(raw).toBe(canonical);
    expect(raw).toBeInstanceOf(NodeAdd);
  });

  it('round-trip: PropSet → normalize → lower → PropSet with same data', () => {
    const original = createPropSetV2('user:alice', 'name', 'Alice');
    const canonical = normalizeRawOp(original);
    const lowered = lowerCanonicalOp(canonical);

    expect(lowered).toBeInstanceOf(PropSetClass);
    expect(lowered.type).toBe('PropSet');
    expect(lowered.node).toBe('user:alice');
    expect(lowered.key).toBe('name');
    expect(lowered.value).toBe('Alice');
  });

  it('round-trip: edge PropSet → normalize → lower → PropSet with same encoding', () => {
    const original = createPropSetV2('\x01n1\x00n2\x00rel', 'weight', 42);
    const canonical = normalizeRawOp(original);
    const lowered = lowerCanonicalOp(canonical);

    expect(lowered).toBeInstanceOf(PropSetClass);
    expect(lowered.type).toBe('PropSet');
    expect(lowered.node).toBe(original.node);
    expect(lowered.key).toBe('weight');
    expect(lowered.value).toBe(42);
  });
});
