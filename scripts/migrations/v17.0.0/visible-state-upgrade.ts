/**
 * Legacy visible-state projection upgrade helper.
 *
 * This file intentionally lives under scripts/migrations. Runtime source
 * does not support retired state/checkpoint schemas; it only exposes the
 * current substrate.
 */
import { createEmptyState } from '../../../src/domain/services/JoinReducer.ts';
import VersionVector from '../../../src/domain/crdt/VersionVector.ts';
import type WarpState from '../../../src/domain/services/state/WarpState.ts';
import type { LWWRegister } from '../../../src/domain/crdt/LWW.ts';
import type { PropValue } from '../../../src/domain/types/PropValue.ts';

type LegacyAliveRegister = { readonly value: boolean };

export type LegacyVisibleState = {
  readonly nodeAlive: ReadonlyMap<string, LegacyAliveRegister>;
  readonly edgeAlive: ReadonlyMap<string, LegacyAliveRegister>;
  readonly prop: ReadonlyMap<string, LWWRegister<PropValue>>;
};

export function upgradeVisibleStateProjection(
  legacyState: LegacyVisibleState,
  migrationWriterId: string,
): WarpState {
  const currentState = createEmptyState();
  const vv = VersionVector.empty();

  upgradeAliveEntities({ legacyState, currentState, vv, migrationWriterId });
  upgradeVisibleProps(legacyState, currentState);

  currentState.observedFrontier = vv;
  return currentState;
}

function upgradeAliveEntities({
  legacyState,
  currentState,
  vv,
  migrationWriterId,
}: {
  readonly legacyState: LegacyVisibleState;
  readonly currentState: WarpState;
  readonly vv: VersionVector;
  readonly migrationWriterId: string;
}): void {
  for (const [nodeId, reg] of legacyState.nodeAlive) {
    if (reg.value) {
      const dot = vv.increment(migrationWriterId);
      currentState.nodeAlive.add(nodeId, dot);
    }
  }
  for (const [edgeKey, reg] of legacyState.edgeAlive) {
    if (reg.value) {
      const dot = vv.increment(migrationWriterId);
      currentState.edgeAlive.add(edgeKey, dot);
    }
  }
}

function upgradeVisibleProps(legacyState: LegacyVisibleState, currentState: WarpState): void {
  for (const [propKey, reg] of legacyState.prop) {
    const idx = propKey.indexOf('\0');
    const nodeId = propKey.slice(0, idx);
    const nodeReg = legacyState.nodeAlive.get(nodeId);
    if (nodeReg?.value === true) {
      currentState.prop.set(propKey, reg);
    }
  }
}
