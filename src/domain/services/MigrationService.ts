/**
 * Creates a v5 checkpoint from v4 visible projection.
 * This is the migration boundary.
 */
import { createEmptyState } from './JoinReducer.ts';
import VersionVector from '../crdt/VersionVector.ts';
import type WarpState from './state/WarpState.ts';
import type { LWWRegister } from '../crdt/LWW.ts';

/**
 * Minimal shape of a v4 "visible projection" entry.
 * Only the `.value` field is read during migration.
 */
type V4AliveRegister = { readonly value: boolean };

/**
 * Shape of the legacy v4 materialized state accepted at the migration boundary.
 *
 * NOTE: The `LWWRegister<unknown>` in `prop` is inherited from WarpState's
 * own field type. It will be tightened when WarpState is converted in a
 * later wave of the TypeScript migration.
 */
type V4State = {
  readonly nodeAlive: ReadonlyMap<string, V4AliveRegister>;
  readonly edgeAlive: ReadonlyMap<string, V4AliveRegister>;
  readonly prop: ReadonlyMap<string, LWWRegister<unknown>>;
};

/**
 * Migrates a V4 visible-projection state to a V5 state with ORSet internals.
 *
 * Creates synthetic dots for each visible node and edge under the migration
 * writer, rebuilds the ORSet structures, and copies only properties belonging
 * to visible nodes (dropping dangling props from deleted nodes).
 */
export function migrateV4toV5(
  v4State: V4State,
  migrationWriterId: string,
): WarpState {
  const v5State = createEmptyState();
  const vv = VersionVector.empty();

  migrateAliveEntities({ v4State, v5State, vv, migrationWriterId });
  migrateVisibleProps(v4State, v5State);

  v5State.observedFrontier = vv;
  return v5State;
}

/**
 * Migrates alive nodes and edges from v4 to v5 ORSets with synthetic dots.
 */
function migrateAliveEntities({
  v4State,
  v5State,
  vv,
  migrationWriterId,
}: {
  readonly v4State: V4State;
  readonly v5State: WarpState;
  readonly vv: VersionVector;
  readonly migrationWriterId: string;
}): void {
  for (const [nodeId, reg] of v4State.nodeAlive) {
    if (reg.value) {
      const dot = vv.increment(migrationWriterId);
      v5State.nodeAlive.add(nodeId, dot);
    }
  }
  for (const [edgeKey, reg] of v4State.edgeAlive) {
    if (reg.value) {
      const dot = vv.increment(migrationWriterId);
      v5State.edgeAlive.add(edgeKey, dot);
    }
  }
}

/**
 * Copies properties for visible nodes only, dropping dangling props from deleted nodes.
 */
function migrateVisibleProps(v4State: V4State, v5State: WarpState): void {
  for (const [propKey, reg] of v4State.prop) {
    const idx = propKey.indexOf('\0');
    const nodeId = propKey.slice(0, idx);
    const nodeReg = v4State.nodeAlive.get(nodeId);
    if (nodeReg?.value === true) {
      v5State.prop.set(propKey, reg);
    }
  }
}
