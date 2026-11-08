import { describe, it, expect } from 'vitest';
import MaterializedViewService from '../../../../src/domain/services/MaterializedViewService.ts';
import { createEmptyState, applyPatchOp } from '../../../../src/domain/services/JoinReducer.ts';
import { Dot, encodeDot } from '../../../../src/domain/crdt/Dot.ts';
import NodeRemove from '../../../../src/domain/types/ops/NodeRemove.ts';
import { EventId } from '../../../../src/domain/utils/EventId.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import SequenceRandomPort from '../../../helpers/SequenceRandomPort.ts';

/** Seed the verifier derives from the bytes 0x00 0x01 0x02 0x03: 0x00010203 >>> 1. */
const SEQUENCE_SEED = 33_025;

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildTestState() {
  const state = createEmptyState();
  const writer = 'w1';
  const sha = 'a'.repeat(40);
  let opIdx = 0;
  let lamport = 1;

  for (const nodeId of ['A', 'B', 'C', 'D']) {
    const dot = Dot.create(writer, lamport);
    const eventId = new EventId(lamport, writer, sha, opIdx++);
    applyPatchOp(state, { type: 'NodeAdd', node: nodeId, dot }, eventId);
    lamport++;
  }

  for (const { from, to, label } of [
    { from: 'A', to: 'B', label: 'manages' },
    { from: 'A', to: 'C', label: 'owns' },
    { from: 'B', to: 'D', label: 'uses' },
    { from: 'C', to: 'D', label: 'refs' },
  ]) {
    const dot = Dot.create(writer, lamport);
    const eventId = new EventId(lamport, writer, sha, opIdx++);
    applyPatchOp(state, { type: 'EdgeAdd', from, to, label, dot }, eventId);
    lamport++;
  }

  return state;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('MaterializedViewService.verifyIndex', () => {
  it('reports all passed for a correct index', () => {
    const service = new MaterializedViewService({ codec: defaultCodec });
    const state = buildTestState();
    const { logicalIndex } = service.build(state);

    const result = service.verifyIndex({
      state,
      logicalIndex,
      random: new SequenceRandomPort(),
      options: { sampleRate: 1.0, seed: 42 },
    });

    expect(result.failed).toBe(0);
    expect(result.passed).toBeGreaterThan(0);
    expect(result.errors).toEqual([]);
    expect(result.seed).toBe(42);
  });

  it('detects mismatch when index is built from different state', () => {
    const service = new MaterializedViewService({ codec: defaultCodec });
    const state = buildTestState();

    // Build index from a smaller state (only 2 nodes, no edges)
    const smallState = createEmptyState();
    const writer = 'w1';
    const sha = 'b'.repeat(40);
    let opIdx = 0;
    let lamport = 1;
    for (const nodeId of ['A', 'B']) {
      const dot = Dot.create(writer, lamport);
      const eventId = new EventId(lamport, writer, sha, opIdx++);
      applyPatchOp(smallState, { type: 'NodeAdd', node: nodeId, dot }, eventId);
      lamport++;
    }
    const { logicalIndex } = service.build(smallState);

    // Verify against the full state — bitmap has no edges for A, B
    const result = service.verifyIndex({
      state,
      logicalIndex,
      random: new SequenceRandomPort(),
      options: { sampleRate: 1.0, seed: 99 },
    });

    expect(result.failed).toBeGreaterThan(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('detects label mismatches for the same neighbor set', () => {
    const service = new MaterializedViewService({ codec: defaultCodec });
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
      logicalIndex: (corruptedIndex),
      random: new SequenceRandomPort(),
      options: { sampleRate: 1.0, seed: 777 },
    });

    expect(result.failed).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.nodeId === 'A' && e.direction === 'out')).toBe(true);
  });

  it('produces reproducible results with the same seed', () => {
    const service = new MaterializedViewService({ codec: defaultCodec });
    const state = buildTestState();
    const { logicalIndex } = service.build(state);

    const opts = { sampleRate: 0.5, seed: 12345 };

    const r1 = service.verifyIndex({ state, logicalIndex, random: new SequenceRandomPort(), options: opts });
    const r2 = service.verifyIndex({ state, logicalIndex, random: new SequenceRandomPort(), options: opts });

    expect(r1.passed).toBe(r2.passed);
    expect(r1.failed).toBe(r2.failed);
    expect(r1.seed).toBe(r2.seed);
    expect(r1.errors).toEqual(r2.errors);
  });

  it('verifies at least one node when sampleRate is positive on non-empty state', () => {
    const service = new MaterializedViewService({ codec: defaultCodec });
    const state = buildTestState();
    const { logicalIndex } = service.build(state);

    const result = service.verifyIndex({
      state,
      logicalIndex,
      random: new SequenceRandomPort(),
      options: { sampleRate: 0.001, seed: 42 },
    });

    expect(result.passed + result.failed).toBeGreaterThan(0);
  });

  it('derives the default seed only from the injected port', () => {
    const service = new MaterializedViewService({ codec: defaultCodec });
    const state = buildTestState();
    const { logicalIndex } = service.build(state);
    const random = new SequenceRandomPort(0);

    const result = service.verifyIndex({ state, logicalIndex, random });
    const replay = service.verifyIndex({ state, logicalIndex, random: new SequenceRandomPort(0) });

    expect(result.seed).toBe(SEQUENCE_SEED);
    expect(replay).toEqual(result);
    expect(random.requests).toEqual([4]);
    expect(result.failed).toBe(0);
    expect(result.errors).toEqual([]);
  });

  it('does not draw entropy when the caller supplies a seed', () => {
    const service = new MaterializedViewService({ codec: defaultCodec });
    const state = buildTestState();
    const { logicalIndex } = service.build(state);
    const random = new SequenceRandomPort(0);

    expect(service.verifyIndex({ state, logicalIndex, random, options: { seed: 5 } }).seed).toBe(5);
    expect(random.requests).toEqual([]);
  });

  it('handles empty state without errors', () => {
    const service = new MaterializedViewService({ codec: defaultCodec });
    const state = createEmptyState();
    const { logicalIndex } = service.build(state);

    const result = service.verifyIndex({
      state,
      logicalIndex,
      random: new SequenceRandomPort(),
      options: { sampleRate: 1.0, seed: 1 },
    });

    expect(result.passed).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.errors).toEqual([]);
  });

  it('detects missing alive nodes even when edge signatures are empty', () => {
    const service = new MaterializedViewService({ codec: defaultCodec });
    const state = createEmptyState();
    const writer = 'w1';
    const sha = 'c'.repeat(40);
    let opIdx = 0;
    let lamport = 1;
    for (const nodeId of ['ISO']) {
      const dot = Dot.create(writer, lamport);
      const eventId = new EventId(lamport, writer, sha, opIdx++);
      applyPatchOp(state, { type: 'NodeAdd', node: nodeId, dot }, eventId);
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
      logicalIndex: (corruptedIndex),
      random: new SequenceRandomPort(),
      options: { sampleRate: 1.0, seed: 123 },
    });

    expect(result.failed).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.nodeId === 'ISO' && e.direction === 'alive')).toBe(true);
  });

  it('samples nothing at a zero rate or from an empty graph', () => {
    const service = new MaterializedViewService({ codec: defaultCodec });
    const state = buildTestState();
    const { logicalIndex } = service.build(state);
    const empty = createEmptyState();

    expect(service.verifyIndex({ state, logicalIndex, random: new SequenceRandomPort(), options: { sampleRate: 0, seed: 1 } }))
      .toMatchObject({ passed: 0, failed: 0 });
    expect(service.verifyIndex({
      state: empty, logicalIndex: service.build(empty).logicalIndex, random: new SequenceRandomPort(), options: { sampleRate: 0.5, seed: 1 },
    })).toMatchObject({ passed: 0, failed: 0 });
  });

  it('ignores edges to removed nodes and merges labels for one neighbor', () => {
    const service = new MaterializedViewService({ codec: defaultCodec });
    const state = buildTestState();
    const sha = 'b'.repeat(40);
    applyPatchOp(state, { type: 'EdgeAdd', from: 'A', to: 'B', label: 'reports', dot: Dot.create('w2', 1) }, new EventId(1, 'w2', sha, 0));
    applyPatchOp(state, { type: 'NodeAdd', node: 'E', dot: Dot.create('w2', 2) }, new EventId(2, 'w2', sha, 1));
    applyPatchOp(state, { type: 'EdgeAdd', from: 'A', to: 'E', label: 'stale', dot: Dot.create('w2', 3) }, new EventId(3, 'w2', sha, 2));
    applyPatchOp(state, new NodeRemove('E', [encodeDot(Dot.create('w2', 2))]), new EventId(4, 'w2', sha, 3));
    const { logicalIndex } = service.build(state);

    const result = service.verifyIndex({ state, logicalIndex, random: new SequenceRandomPort(), options: { sampleRate: 1, seed: 1 } });

    expect(result.failed).toBe(0);
    expect(result.passed).toBeGreaterThan(0);
  });
});
