import { describe, it, expect } from 'vitest';
import {
  applySyncResponse,
} from '../../../../src/domain/services/sync/SyncProtocol.ts';
import {
  createEmptyState,
} from '../../../../src/domain/services/JoinReducer.ts';
import { createFrontier } from '../../../../src/domain/services/Frontier.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SHA_A = 'a'.repeat(40);

function makeSyncResponse(ops: any): any {
  return {
    type: 'sync-response',
    frontier: { w1: SHA_A },
    patches: [{
      writerId: 'w1',
      sha: SHA_A,
      patch: {
        schema: 2,
        writer: 'w1',
        lamport: 1,
        ops,
        context: VersionVector.empty(),
      },
    }],
  };
}

// ---------------------------------------------------------------------------
// ADR 2 Tripwire — Wire Gate Tests
//
// The sync gate in SyncProtocol.applySyncResponse must reject canonical-only
// op types (NodePropSet, EdgePropSet) that should NEVER appear on the wire
// before ADR 2 capability cutover. These tests act as tripwires: if they
// start failing, someone has changed the gate to accept canonical ops on
// the wire — which is only safe after ADR 2 is implemented.
// ---------------------------------------------------------------------------

describe('SyncProtocol wire gate (ADR 2 tripwire)', () => {
  it('rejects raw EdgePropSet arriving via sync', () => {
    const state = createEmptyState();
    const frontier = createFrontier();
    const response = makeSyncResponse([
      { type: 'EdgePropSet', from: 'a', to: 'b', label: 'rel', key: 'w', value: 1 },
    ]);

    expect(() =>
      applySyncResponse((response), state, frontier)
    ).toThrow(/unknown op type.*EdgePropSet/);
  });

  it('rejects raw NodePropSet arriving via sync', () => {
    const state = createEmptyState();
    const frontier = createFrontier();
    const response = makeSyncResponse([
      { type: 'NodePropSet', node: 'x', key: 'color', value: 'red' },
    ]);

    expect(() =>
      applySyncResponse((response), state, frontier)
    ).toThrow(/unknown op type.*NodePropSet/);
  });

  it('accepts raw PropSet arriving via sync', () => {
    const state = createEmptyState();
    const frontier = createFrontier();
    const response = makeSyncResponse([
      { type: 'NodeAdd', node: 'x', dot: Dot.create('w1', 1) },
      { type: 'PropSet', node: 'x', key: 'color', value: 'blue' },
    ]);

    const result = ((applySyncResponse( (response), state, frontier)) as any);
    expect(result.applied).toBe(1);
  });

  it('accepts all 6 raw wire-format types', () => {
    const state = createEmptyState();
    const frontier = createFrontier();
    const dot = Dot.create('w1', 1);
    const response = makeSyncResponse([
      { type: 'NodeAdd', node: 'x', dot },
      { type: 'EdgeAdd', from: 'x', to: 'x', label: 'self', dot },
      { type: 'PropSet', node: 'x', key: 'k', value: 'v' },
      { type: 'BlobValue', ref: 'abc123' },
      { type: 'EdgeRemove', from: 'x', to: 'x', label: 'self', observedDots: [] },
      { type: 'NodeRemove', node: 'x', observedDots: [] },
    ]);

    const result = ((applySyncResponse( (response), state, frontier)) as any);
    expect(result.applied).toBe(1);
  });

  it('rejects unknown future op types', () => {
    const state = createEmptyState();
    const frontier = createFrontier();
    const response = makeSyncResponse([
      { type: 'HyperEdgeAdd', vertices: ['a', 'b', 'c'] },
    ]);

    expect(() =>
      applySyncResponse((response), state, frontier)
    ).toThrow(/unknown op type.*HyperEdgeAdd/);
  });
});
