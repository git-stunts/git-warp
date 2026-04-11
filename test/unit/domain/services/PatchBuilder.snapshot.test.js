/**
 * PatchBuilder snapshot tests (C4).
 *
 * Verifies that _getSnapshotState() captures state lazily on first call
 * and reuses it for subsequent operations, preventing TOCTOU races.
 */

import { describe, it, expect, vi } from 'vitest';
import { PatchBuilder } from '../../../../src/domain/services/PatchBuilder.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import { createStateBuilder } from '../../../helpers/stateBuilder.js';

/**
 * Creates a builder with a controllable getCurrentState mock.
 * @param {Function} getCurrentState
 * @returns {PatchBuilder}
 */
function makeBuilder(getCurrentState) {
  return new PatchBuilder(/** @type {any} */ ({
    writerId: 'w1',
    lamport: 1,
    versionVector: VersionVector.empty(),
    getCurrentState,
  }));
}

describe('PatchBuilder snapshot (C4)', () => {
  it('calls getCurrentState exactly once on first snapshot access', () => {
    const state = createStateBuilder().node('node:a', { counter: 1 }).build();
    const spy = vi.fn(() => state);

    const builder = makeBuilder(spy);

    // First access triggers capture
    builder.removeNode('node:a');
    expect(spy).toHaveBeenCalledTimes(1);

    // Second access reuses cached snapshot
    builder.removeNode('node:a');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('snapshot is stable after underlying state mutation', () => {
    const stateBuilder = createStateBuilder().node('node:a', { counter: 1 });
    const state = stateBuilder.build();

    const spy = vi.fn(() => state);
    const builder = makeBuilder(spy);

    // Trigger snapshot capture
    builder.removeNode('node:a');
    expect(spy).toHaveBeenCalledTimes(1);

    // Mutate the original state after snapshot capture
    stateBuilder.node('node:b', { counter: 2 });

    // Second remove reuses the cached snapshot (spy not called again)
    builder.removeNode('node:a');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('throws E_PATCH_NO_STATE when getCurrentState returns null', () => {
    const spy = vi.fn(() => null);
    const builder = makeBuilder(spy);

    // removeNode with null state must throw — can't observe dots without state
    expect(() => builder.removeNode('nonexistent')).toThrow('must be materialized');

    // getCurrentState was called (snapshot attempted)
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('does not capture snapshot for addNode (only removes need it)', () => {
    const spy = vi.fn(() => createStateBuilder().build());
    const builder = makeBuilder(spy);

    builder.addNode('node:x');
    // getCurrentState should NOT be called for add operations
    expect(spy).not.toHaveBeenCalled();
  });
});
