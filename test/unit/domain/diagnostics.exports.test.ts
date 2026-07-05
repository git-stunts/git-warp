/**
 * Tests for the diagnostics inspection exports.
 *
 * Verifies that materialized-state inspection helpers have an explicit
 * diagnostics home instead of forcing operators through legacy.
 */

import { describe, expect, it } from 'vitest';

import ORSet from '../../../src/domain/crdt/ORSet.ts';
import VersionVector from '../../../src/domain/crdt/VersionVector.ts';
import WarpState from '../../../src/domain/services/state/WarpState.ts';
import {
  normalizeVisibleStateScope,
  nodeIdInVisibleStateScope,
  scopeMaterializedState,
} from '../../../diagnostics.ts';

function emptyWarpState(): WarpState {
  return new WarpState({
    nodeAlive: ORSet.empty(),
    edgeAlive: ORSet.empty(),
    prop: new Map(),
    observedFrontier: VersionVector.empty(),
    edgeBirthEvent: new Map(),
  });
}

describe('diagnostics.ts exports', () => {
  it('exports visible-state scope helpers for materialization inspection', () => {
    const scope = normalizeVisibleStateScope({
      nodeIdPrefixes: {
        exclude: ['task:archived:'],
        include: ['task:'],
      },
    });

    expect(scope).toEqual({
      nodeIdPrefixes: {
        exclude: ['task:archived:'],
        include: ['task:'],
      },
    });
    expect(nodeIdInVisibleStateScope('task:1', scope)).toBe(true);
    expect(nodeIdInVisibleStateScope('task:archived:1', scope)).toBe(false);

    const state = emptyWarpState();

    expect(scopeMaterializedState(state, null)).toBe(state);
  });
});
