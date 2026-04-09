import { describe, it, expect } from 'vitest';
import MaterializedViewService from '../../../../src/domain/services/MaterializedViewService.js';
import { createEmptyState, applyOpV2 } from '../../../../src/domain/services/JoinReducer.ts';
import { createDot } from '../../../../src/domain/crdt/Dot.ts';
import { createEventId } from '../../../../src/domain/utils/EventId.ts';

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildTestState() {
  const state = createEmptyState();
  const writer = 'w1';
  const sha = 'a'.repeat(40);
  let opIdx = 0;
  let lamport = 1;

  for (const nodeId of ['A', 'B', 'C', 'D']) {
    const dot = createDot(writer, lamport);
    const eventId = createEventId(lamport, writer, sha, opIdx++);
    applyOpV2(state, { type: 'NodeAdd', node: nodeId, dot }, eventId);
    lamport++;
  }

  for (const { from, to, label } of [
    { from: 'A', to: 'B', label: 'manages' },
    { from: 'A', to: 'C', label: 'owns' },
    { from: 'B', to: 'D', label: 'uses' },
    { from: 'C', to: 'D', label: 'refs' },
  ]) {
    const dot = createDot(writer, lamport);
    const eventId = createEventId(lamport, writer, sha, opIdx++);
    applyOpV2(state, { type: 'EdgeAdd', from, to, label, dot }, eventId);
    lamport++;
  }

  return state;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('MaterializedViewService.verifyIndex', () => {
  it('reports all passed for a correct index', () => {
    const service = new MaterializedViewService();
    const state = buildTestState();
    const { logicalIndex } = service.build(state);

    const result = service.verifyIndex({
      state,
      logicalIndex,
      options: { sampleRate: 1.0, seed: 42 },
    });

    expect(result.failed).toBe(0);
    expect(result.passed).toBeGreaterThan(0);
    expect(result.errors).toEqual([]);
    expect(result.seed).toBe(42);
  });

  it('detects mismatch when index is built from different state', () => {
    const service = new MaterializedViewService();
    const state = buildTestState();

    // Build index from a smaller state (only 2 nodes, no edges)
    const smallState = createEmptyState();
    const writer = 'w1';
    const sha = 'b'.repeat(40);
    let opIdx = 0;
    let lamport = 1;
    for (const nodeId of ['A', 'B']) {
      const dot = createDot(writer, lamport);
      const eventId = createEventId(lamport, writer, sha, opIdx++);
      applyOpV2(smallState, { type: 'NodeAdd', node: nodeId, dot }, eventId);
      lamport++;
    }
    const { logicalIndex } = service.build(smallState);

    // Verify against the full state — bitmap has no edges for A, B
    const result = service.verifyIndex({
      state,
      logicalIndex,
      options: { sampleRate: 1.0, seed: 99 },
    });

    expect(result.failed).toBeGreaterThan(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('detects label mismatches for the same neighbor set', () => {
    const service = new MaterializedViewService();
    const state = buildTestState();
    const { logicalIndex } = service.build(state);

    const corruptedIndex = {
      ...logicalIndex,
      getEdges(
        /** @type {string} */ nodeId,
        /** @type {'out'|'in'|'both'} */ direction,
        /** @type {number[]|undefined} */ filterLabelIds,
      ) {
        const edges = logicalIndex.getEdges(nodeId, direction, filterLabelIds);
        if (nodeId === 'A' && direction === 'out') {
          return edges.map((edge) => (
            edge.neighborId === 'B'
              ? { ...edge, label: 'wrong-label' }
              : edge
          ));
        }
        return edges;
      },
    };

    const result = service.verifyIndex({
      state,
      logicalIndex: /** @type {any} */ (corruptedIndex),
      options: { sampleRate: 1.0, seed: 777 },
    });

    expect(result.failed).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.nodeId === 'A' && e.direction === 'out')).toBe(true);
  });

  it('produces reproducible results with the same seed', () => {
    const service = new MaterializedViewService();
    const state = buildTestState();
    const { logicalIndex } = service.build(state);

    const opts = { sampleRate: 0.5, seed: 12345 };

    const r1 = service.verifyIndex({ state, logicalIndex, options: opts });
    const r2 = service.verifyIndex({ state, logicalIndex, options: opts });

    expect(r1.passed).toBe(r2.passed);
    expect(r1.failed).toBe(r2.failed);
    expect(r1.seed).toBe(r2.seed);
    expect(r1.errors).toEqual(r2.errors);
  });

  it('verifies at least one node when sampleRate is positive on non-empty state', () => {
    const service = new MaterializedViewService();
    const state = buildTestState();
    const { logicalIndex } = service.build(state);

    const result = service.verifyIndex({
      state,
      logicalIndex,
      options: { sampleRate: 0.001, seed: 42 },
    });

    expect(result.passed + result.failed).toBeGreaterThan(0);
  });

  it('uses default seed and sampleRate when options omitted', () => {
    const service = new MaterializedViewService();
    const state = buildTestState();
    const { logicalIndex } = service.build(state);

    const result = service.verifyIndex({ state, logicalIndex });

    expect(typeof result.seed).toBe('number');
    expect(result.failed).toBe(0);
    expect(result.errors).toEqual([]);
  });

  it('handles empty state without errors', () => {
    const service = new MaterializedViewService();
    const state = createEmptyState();
    const { logicalIndex } = service.build(state);

    const result = service.verifyIndex({
      state,
      logicalIndex,
      options: { sampleRate: 1.0, seed: 1 },
    });

    expect(result.passed).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.errors).toEqual([]);
  });

  it('detects missing alive nodes even when edge signatures are empty', () => {
    const service = new MaterializedViewService();
    const state = createEmptyState();
    const writer = 'w1';
    const sha = 'c'.repeat(40);
    let opIdx = 0;
    let lamport = 1;
    for (const nodeId of ['ISO']) {
      const dot = createDot(writer, lamport);
      const eventId = createEventId(lamport, writer, sha, opIdx++);
      applyOpV2(state, { type: 'NodeAdd', node: nodeId, dot }, eventId);
      lamport++;
    }

    const { logicalIndex } = service.build(state);
    const corruptedIndex = {
      ...logicalIndex,
      isAlive(/** @type {string} */ nodeId) {
        if (nodeId === 'ISO') {
          return false;
        }
        return logicalIndex.isAlive(nodeId);
      },
    };

    const result = service.verifyIndex({
      state,
      logicalIndex: /** @type {any} */ (corruptedIndex),
      options: { sampleRate: 1.0, seed: 123 },
    });

    expect(result.failed).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.nodeId === 'ISO' && e.direction === 'alive')).toBe(true);
  });
});
