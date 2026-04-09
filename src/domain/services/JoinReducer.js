/**
 * JoinReducer - WARP v5 OR-Set based reducer
 *
 * WarpStateV5 = {
 *   nodeAlive: ORSet<NodeId>,           // GLOBAL OR-Set
 *   edgeAlive: ORSet<EdgeKey>,          // GLOBAL OR-Set
 *   prop: Map<PropKey, LWWRegister>,    // Keep v4 LWW with EventId
 *   observedFrontier: VersionVector
 * }
 */

import VersionVector from '../crdt/VersionVector.ts';
import { lwwSet, lwwMax } from '../crdt/LWW.ts';
import { createEventId, compareEventIds } from '../utils/EventId.ts';
import { createTickReceipt, OP_TYPES } from '../types/TickReceipt.ts';
import { encodeDot } from '../crdt/Dot.ts';
import { encodeEdgeKey, decodeEdgeKey, encodePropKey, encodeEdgePropKey, EDGE_PROP_PREFIX } from './KeyCodec.js';
import { normalizeRawOp } from './OpNormalizer.ts';
import { createEmptyDiff, mergeDiffs } from '../types/PatchDiff.ts';
import PatchError from '../errors/PatchError.ts';
import WarpStateV5 from './state/WarpStateV5.ts';
import OpOutcomeResult from '../types/ops/OpOutcomeResult.ts';
import OpApplied from '../types/ops/OpApplied.ts';
import OpSuperseded from '../types/ops/OpSuperseded.ts';
import OpRedundant from '../types/ops/OpRedundant.ts';
import OpValidator from './OpValidator.ts';

export { default as WarpStateV5 } from './state/WarpStateV5.ts';

// OpOutcomeResult and its subclasses live in src/domain/types/ops/.
// Re-exported for consumers that still import them from JoinReducer;
// re-exports disappear in the thin-core JoinReducer step.
export { default as OpOutcomeResult } from '../types/ops/OpOutcomeResult.ts';
export { default as OpApplied } from '../types/ops/OpApplied.ts';
export { default as OpSuperseded } from '../types/ops/OpSuperseded.ts';
export { default as OpRedundant } from '../types/ops/OpRedundant.ts';

// Re-export key codec functions for backward compatibility
export {
  encodeEdgeKey, decodeEdgeKey,
  encodePropKey, decodePropKey,
  EDGE_PROP_PREFIX,
  encodeEdgePropKey, isEdgePropKey, decodeEdgePropKey,
} from './KeyCodec.js';

// Re-export op normalization for consumers that operate on raw patches
export { normalizeRawOp, lowerCanonicalOp } from './OpNormalizer.ts';

// WarpStateV5 class imported from ./WarpStateV5.ts (re-exported above)

/**
 * @typedef {Object} OpLike
 * @property {string} type - Operation type discriminator
 * @property {string} [node] - Node ID (for NodeAdd, NodeRemove, PropSet)
 * @property {import('../crdt/Dot.ts').Dot} [dot] - Dot identifier (for NodeAdd, EdgeAdd)
 * @property {ReadonlyArray<string>|string[]} [observedDots] - Encoded dots to remove (for NodeRemove, EdgeRemove)
 * @property {string} [from] - Source node ID (for EdgeAdd, EdgeRemove)
 * @property {string} [to] - Target node ID (for EdgeAdd, EdgeRemove)
 * @property {string} [label] - Edge label (for EdgeAdd, EdgeRemove)
 * @property {string} [key] - Property key (for PropSet)
 * @property {unknown} [value] - Property value (for PropSet)
 * @property {string} [oid] - Blob object ID (for BlobValue)
 */

/**
 * @typedef {Object} PatchLike
 * @property {string} writer - Writer ID who created this patch
 * @property {number} lamport - Lamport timestamp of this patch
 * @property {OpLike[]} ops - Ordered array of operations
 * @property {import('../crdt/VersionVector.ts').default|Map<string, number>|Record<string, number>} context - Version vector context
 */

/**
 * Creates an empty V5 state with all CRDT structures initialized.
 *
 * This is the starting point for fresh materialization. The returned state has:
 * - Empty `nodeAlive` OR-Set (no nodes)
 * - Empty `edgeAlive` OR-Set (no edges)
 * - Empty `prop` Map (no properties)
 * - Zero `observedFrontier` version vector (no patches observed)
 * - Empty `edgeBirthEvent` Map (no edge birth events tracked)
 *
 * @returns {WarpStateV5} A fresh, empty WARP state ready for patch application
 */
export function createEmptyStateV5() {
  return WarpStateV5.empty();
}

/**
 * Applies a single V2 operation to state.
 *
 * This is the core mutation function for WARP state. It handles six operation types:
 * - `NodeAdd`: Adds a node to the nodeAlive OR-Set with its dot identifier
 * - `NodeRemove`: Removes observed dots from the nodeAlive OR-Set (tombstoning)
 * - `EdgeAdd`: Adds an edge to the edgeAlive OR-Set and tracks its birth event
 * - `EdgeRemove`: Removes observed dots from the edgeAlive OR-Set (tombstoning)
 * - `PropSet`: Sets a property using LWW (Last-Write-Wins) semantics based on EventId
 * - `BlobValue`: No-op in state; recorded in tick receipts for provenance tracking
 * - Unknown types: Silently ignored for forward compatibility
 *
 * **Warning**: This function mutates `state` in place. For immutable operations,
 * clone the state first using `cloneStateV5()`.
 *
 * @param {WarpStateV5} state - The state to mutate. Modified in place.
 * @param {OpLike} op - The operation to apply
 * @param {import('../utils/EventId.ts').EventId} eventId - Event ID for causality tracking
 * @returns {void}
 */
// Type recognition and field assertion live on OpValidator. The symbols
// below are thin wrappers kept ONLY for legacy consumers (SyncProtocol,
// a handful of tests). They disappear when JoinReducer becomes thin in
// step 7 and consumers migrate to OpValidator directly.

/** @deprecated Use OpValidator.RAW_KNOWN_OPS */
export const RAW_KNOWN_OPS = OpValidator.RAW_KNOWN_OPS;
/** @deprecated Use OpValidator.CANONICAL_KNOWN_OPS */
export const CANONICAL_KNOWN_OPS = OpValidator.CANONICAL_KNOWN_OPS;
/** @deprecated Use OpValidator.isKnownRaw */
export function isKnownRawOp(op) { return OpValidator.isKnownRaw(op); }
/** @deprecated Use OpValidator.isKnownCanonical */
export function isKnownCanonicalOp(op) { return OpValidator.isKnownCanonical(op); }

/**
 * @typedef {{ type: string, [key: string]: unknown }} OpLikeRecord
 */

// ============================================================================
// OpStrategy Registry — structural coupling of all apply paths
// ============================================================================

// Outcome classes extracted to src/domain/types/ops/ (OpOutcomeResult,
// OpApplied, OpSuperseded, OpRedundant). Re-exported at the top of this
// file. Internal code imports the concrete classes directly.

/**
 * @typedef {Object} OpStrategy
 * @property {string} receiptName - The TickReceipt-compatible operation type name (e.g. 'NodeTombstone' for NodeRemove)
 * @property {(state: WarpStateV5, op: OpLike, eventId: import('../utils/EventId.ts').EventId) => void} mutate
 * @property {(state: WarpStateV5, op: OpLike, eventId: import('../utils/EventId.ts').EventId) => OpOutcomeResult} outcome
 * @property {(state: WarpStateV5, op: OpLike) => SnapshotBeforeOp} snapshot
 * @property {(diff: import('../types/PatchDiff.ts').PatchDiff, state: WarpStateV5, op: OpLike, before: SnapshotBeforeOp) => void} accumulate
 * @property {(op: OpLikeRecord) => void} validate
 */

/** @type {OpStrategy} */
const nodeAddStrategy = {
  receiptName: 'NodeAdd',
  validate(op) { OpValidator.assertString(op, 'node'); OpValidator.assertDot(op); },
  mutate(state, op) {
    state.nodeAlive.add(/** @type {string} */ (op.node), /** @type {import('../crdt/Dot.ts').Dot} */ (op.dot));
  },
  outcome(state, op) {
    return nodeAddOutcome(state.nodeAlive, /** @type {{node: string, dot: import('../crdt/Dot.ts').Dot}} */ (op));
  },
  snapshot(state, op) {
    return { nodeWasAlive: state.nodeAlive.contains(/** @type {string} */ (op.node)) };
  },
  accumulate(diff, state, op, before) {
    if (before.nodeWasAlive !== true && state.nodeAlive.contains(/** @type {string} */ (op.node))) {
      diff.nodesAdded.push(/** @type {string} */ (op.node));
    }
  },
};

/** @type {OpStrategy} */
const nodeRemoveStrategy = {
  receiptName: 'NodeTombstone',
  validate(op) { OpValidator.assertIterable(op, 'observedDots'); },
  mutate(state, op) {
    state.nodeAlive.remove(/** @type {Set<string>} */ (/** @type {unknown} */ (op.observedDots)));
  },
  outcome(state, op) {
    return nodeRemoveOutcome(state.nodeAlive, /** @type {{node?: string, observedDots: string[]}} */ (op));
  },
  snapshot(state, op) {
    const rawDots = /** @type {Iterable<string>} */ (op.observedDots);
    /** @type {Set<string>} */
    const nodeDots = rawDots instanceof Set ? rawDots : new Set(rawDots);
    return { aliveBeforeNodes: aliveElementsForDots(state.nodeAlive, nodeDots) };
  },
  accumulate(diff, state, _op, before) {
    collectNodeRemovals(diff, state, before);
  },
};

/** @type {OpStrategy} */
const edgeAddStrategy = {
  receiptName: 'EdgeAdd',
  validate(op) { OpValidator.assertString(op, 'from'); OpValidator.assertString(op, 'to'); OpValidator.assertString(op, 'label'); OpValidator.assertDot(op); },
  mutate(state, op, eventId) {
    const edgeKey = encodeEdgeKey(/** @type {string} */ (op.from), /** @type {string} */ (op.to), /** @type {string} */ (op.label));
    state.edgeAlive.add(edgeKey, /** @type {import('../crdt/Dot.ts').Dot} */ (op.dot));
    if (state.edgeBirthEvent !== null && state.edgeBirthEvent !== undefined) {
      const prev = state.edgeBirthEvent.get(edgeKey);
      if (prev === undefined || compareEventIds(eventId, prev) > 0) {
        state.edgeBirthEvent.set(edgeKey, eventId);
      }
    }
  },
  outcome(state, op) {
    const edgeKey = encodeEdgeKey(/** @type {string} */ (op.from), /** @type {string} */ (op.to), /** @type {string} */ (op.label));
    return edgeAddOutcome(state.edgeAlive, /** @type {{from: string, to: string, label: string, dot: import('../crdt/Dot.ts').Dot}} */ (op), edgeKey);
  },
  snapshot(state, op) {
    const ek = encodeEdgeKey(/** @type {string} */ (op.from), /** @type {string} */ (op.to), /** @type {string} */ (op.label));
    return { edgeWasAlive: state.edgeAlive.contains(ek), edgeKey: ek };
  },
  accumulate(diff, state, op, before) {
    if (before.edgeWasAlive !== true && state.edgeAlive.contains(/** @type {string} */ (before.edgeKey))) {
      diff.edgesAdded.push({ from: /** @type {string} */ (op.from), to: /** @type {string} */ (op.to), label: /** @type {string} */ (op.label) });
    }
  },
};

/** @type {OpStrategy} */
const edgeRemoveStrategy = {
  receiptName: 'EdgeTombstone',
  validate(op) { OpValidator.assertIterable(op, 'observedDots'); },
  mutate(state, op) {
    state.edgeAlive.remove(/** @type {Set<string>} */ (/** @type {unknown} */ (op.observedDots)));
  },
  outcome(state, op) {
    return edgeRemoveOutcome(state.edgeAlive, /** @type {{from?: string, to?: string, label?: string, observedDots: string[]}} */ (op));
  },
  snapshot(state, op) {
    const rawEdgeDots = /** @type {Iterable<string>} */ (op.observedDots);
    /** @type {Set<string>} */
    const edgeDots = rawEdgeDots instanceof Set ? rawEdgeDots : new Set(rawEdgeDots);
    return { aliveBeforeEdges: aliveElementsForDots(state.edgeAlive, edgeDots) };
  },
  accumulate(diff, state, _op, before) {
    collectEdgeRemovals(diff, state, before);
  },
};

/**
 * Shared mutate logic for node property ops (NodePropSet and legacy PropSet).
 * @param {WarpStateV5} state
 * @param {string} propKey
 * @param {import('../utils/EventId.ts').EventId} eventId
 * @param {unknown} value
 */
function mutateProp(state, propKey, eventId, value) {
  const current = state.prop.get(propKey);
  state.prop.set(propKey, /** @type {import('../crdt/LWW.ts').LWWRegister<unknown>} */ (lwwMax(current, lwwSet(eventId, value))));
}

/**
 * Shared snapshot for property ops.
 * @param {WarpStateV5} state
 * @param {string} propKey
 * @returns {SnapshotBeforeOp}
 */
function snapshotProp(state, propKey) {
  const reg = state.prop.get(propKey);
  return { prevPropValue: reg !== null && reg !== undefined ? reg.value : undefined, propKey };
}

/**
 * Shared diff accumulator for property ops.
 * @param {import('../types/PatchDiff.ts').PatchDiff} diff
 * @param {WarpStateV5} state
 * @param {string} nodeId
 * @param {string} key
 * @param {SnapshotBeforeOp} before
 */
function accumulatePropDiff(diff, state, nodeId, key, before) {
  const reg = state.prop.get(/** @type {string} */ (before.propKey));
  const newVal = reg !== null && reg !== undefined ? reg.value : undefined;
  if (newVal !== before.prevPropValue) {
    diff.propsChanged.push({ nodeId, key, value: newVal, prevValue: before.prevPropValue });
  }
}

/** @type {OpStrategy} */
const nodePropSetStrategy = {
  receiptName: 'NodePropSet',
  validate(op) { OpValidator.assertString(op, 'node'); OpValidator.assertString(op, 'key'); },
  mutate(state, op, eventId) {
    mutateProp(state, encodePropKey(/** @type {string} */ (op.node), /** @type {string} */ (op.key)), eventId, op.value);
  },
  outcome(state, op, eventId) {
    return propSetOutcome(state.prop, /** @type {{node: string, key: string}} */ (op), eventId);
  },
  snapshot(state, op) {
    return snapshotProp(state, encodePropKey(/** @type {string} */ (op.node), /** @type {string} */ (op.key)));
  },
  accumulate(diff, state, op, before) {
    accumulatePropDiff(diff, state, /** @type {string} */ (op.node), /** @type {string} */ (op.key), before);
  },
};

/** @type {OpStrategy} */
const edgePropSetStrategy = {
  receiptName: 'EdgePropSet',
  validate(op) { OpValidator.assertString(op, 'from'); OpValidator.assertString(op, 'to'); OpValidator.assertString(op, 'label'); OpValidator.assertString(op, 'key'); },
  mutate(state, op, eventId) {
    mutateProp(state, encodeEdgePropKey(/** @type {string} */ (op.from), /** @type {string} */ (op.to), /** @type {string} */ (op.label), /** @type {string} */ (op.key)), eventId, op.value);
  },
  outcome(state, op, eventId) {
    return edgePropSetOutcome(state.prop, /** @type {{from: string, to: string, label: string, key: string}} */ (op), eventId);
  },
  snapshot(state, op) {
    return snapshotProp(state, encodeEdgePropKey(/** @type {string} */ (op.from), /** @type {string} */ (op.to), /** @type {string} */ (op.label), /** @type {string} */ (op.key)));
  },
  accumulate(diff, state, op, before) {
    accumulatePropDiff(diff, state, encodeEdgeKey(/** @type {string} */ (op.from), /** @type {string} */ (op.to), /** @type {string} */ (op.label)), /** @type {string} */ (op.key), before);
  },
};

/** @type {OpStrategy} */
const propSetStrategy = {
  receiptName: 'PropSet',
  validate(op) { OpValidator.assertString(op, 'node'); OpValidator.assertString(op, 'key'); },
  mutate(state, op, eventId) {
    // Legacy raw PropSet — must NOT carry edge-property encoding at this point.
    if (typeof op.node === 'string' && op.node[0] === EDGE_PROP_PREFIX) {
      throw new PatchError(
        'Unnormalized legacy edge-property PropSet reached canonical apply path. ' +
        'Call normalizeRawOp() at the decode boundary.',
        { context: { opType: 'PropSet', node: op.node } },
      );
    }
    mutateProp(state, encodePropKey(/** @type {string} */ (op.node), /** @type {string} */ (op.key)), eventId, op.value);
  },
  outcome(state, op, eventId) {
    return propSetOutcome(state.prop, /** @type {{node: string, key: string}} */ (op), eventId);
  },
  snapshot(state, op) {
    return snapshotProp(state, encodePropKey(/** @type {string} */ (op.node), /** @type {string} */ (op.key)));
  },
  accumulate(diff, state, op, before) {
    accumulatePropDiff(diff, state, /** @type {string} */ (op.node), /** @type {string} */ (op.key), before);
  },
};

/** @type {OpStrategy} */
const blobValueStrategy = {
  receiptName: 'BlobValue',
  validate() { /* no-op: forward-compat */ },
  mutate() { /* no-op: BlobValue has no state effect */ },
  outcome(_state, op) {
    const blobOp = /** @type {{ oid?: string }} */ (op);
    const blobOid = blobOp.oid;
    const blobTarget = (typeof blobOid === 'string' && blobOid.length > 0) ? blobOid : '*';
    return new OpApplied(blobTarget);
  },
  snapshot() { return {}; },
  accumulate() { /* no-op */ },
};

/**
 * Frozen registry mapping canonical op types to their strategy objects.
 * Adding a new op type requires defining all five strategy methods.
 * @type {ReadonlyMap<string, OpStrategy>}
 */
export const OP_STRATEGIES = Object.freeze(new Map([
  ['NodeAdd', nodeAddStrategy],
  ['NodeRemove', nodeRemoveStrategy],
  ['EdgeAdd', edgeAddStrategy],
  ['EdgeRemove', edgeRemoveStrategy],
  ['NodePropSet', nodePropSetStrategy],
  ['EdgePropSet', edgePropSetStrategy],
  ['PropSet', propSetStrategy],
  ['BlobValue', blobValueStrategy],
]));

// Load-time validation: every strategy must have all five methods
for (const [type, strategy] of OP_STRATEGIES) {
  for (const method of ['mutate', 'outcome', 'snapshot', 'accumulate', 'validate']) {
    if (typeof /** @type {Record<string, unknown>} */ (strategy)[method] !== 'function') {
      throw new Error(`OpStrategy '${type}' missing required method '${method}'`);
    }
  }
  if (typeof strategy.receiptName !== 'string' || strategy.receiptName.length === 0) {
    throw new Error(`OpStrategy '${type}' missing required property 'receiptName'`);
  }
  if (!OP_TYPES.includes(strategy.receiptName)) {
    throw new Error(`OpStrategy '${type}' receiptName '${strategy.receiptName}' is not in TickReceipt OP_TYPES`);
  }
}

/**
 * Applies a single V2 operation to the given CRDT state.
 *
 * @param {WarpStateV5} state - The mutable CRDT state to update
 * @param {{type: string, node?: string, dot?: import('../crdt/Dot.ts').Dot, observedDots?: string[], from?: string, to?: string, label?: string, key?: string, value?: unknown, oid?: string}} op - The operation to apply
 * @param {import('../utils/EventId.ts').EventId} eventId - The event ID for LWW ordering
 */
export function applyOpV2(state, op, eventId) {
  if (op === null || op === undefined || typeof op.type !== 'string') {
    throw new PatchError(
      `Invalid op: expected object with string 'type', got ${op === null || op === undefined ? String(op) : typeof op.type}`,
      { context: { actual: op === null || op === undefined ? String(op) : typeof op.type } },
    );
  }
  const strategy = OP_STRATEGIES.get(op.type);
  if (!strategy) { return; } // Unknown ops silently ignored (forward-compat)
  strategy.validate(/** @type {OpLikeRecord} */ (op));
  strategy.mutate(state, op, eventId);
}


/**
 * Set of valid receipt op types (from TickReceipt) for fast membership checks.
 * Used to filter out forward-compatible unknown operation types from receipts.
 * @const {Set<string>}
 */
const VALID_RECEIPT_OPS = new Set(OP_TYPES);

/**
 * Determines the receipt outcome for a NodeAdd operation.
 *
 * Checks if the node's dot already exists in the OR-Set to determine whether
 * this add operation is effective or redundant (idempotent re-delivery).
 *
 * @param {import('../crdt/ORSet.ts').default} orset - The node OR-Set containing alive nodes
 * @param {{node: string, dot: import('../crdt/Dot.ts').Dot}} op - The NodeAdd operation
 * @returns {OpApplied|OpRedundant} Outcome with node ID as target
 */
function nodeAddOutcome(orset, op) {
  const encoded = encodeDot(op.dot);
  const existingDots = orset.entries.get(op.node);
  if (existingDots && existingDots.has(encoded)) {
    return new OpRedundant(op.node);
  }
  return new OpApplied(op.node);
}

/**
 * Determines the receipt outcome for a NodeRemove (tombstone) operation.
 *
 * Checks if any of the observed dots exist in the OR-Set and are not yet tombstoned.
 * A remove is only effective if it actually removes at least one existing, non-tombstoned dot.
 * This implements OR-Set remove semantics where removes only affect dots that were
 * observed at the time the remove was issued.
 *
 * @param {import('../crdt/ORSet.ts').default} orset - The node OR-Set containing alive nodes
 * @param {{node?: string, observedDots: string[] | Set<string>}} op - The NodeRemove operation
 * @returns {OpApplied|OpRedundant} Outcome with node ID (or '*') as target
 */
function nodeRemoveOutcome(orset, op) {
  // Build a reverse index (dot → elementId) for the observed dots to avoid
  // O(|observedDots| × |entries|) scanning. Same pattern as buildDotToElement.
  const targetDots = op.observedDots instanceof Set
    ? op.observedDots
    : new Set(op.observedDots);
  const dotToElement = buildDotToElement(orset, targetDots);

  let effective = false;
  for (const encodedDot of targetDots) {
    if (!orset.tombstones.has(encodedDot) && dotToElement.has(encodedDot)) {
      effective = true;
      break;
    }
  }
  const target = (typeof op.node === 'string' && op.node.length > 0) ? op.node : '*';
  return { target, result: effective ? 'applied' : 'redundant' };
}

/**
 * Determines the receipt outcome for an EdgeAdd operation.
 *
 * Checks if the edge's dot already exists in the OR-Set to determine whether
 * this add operation is effective or redundant (idempotent re-delivery).
 * Unlike nodes, edges are keyed by the composite (from, to, label) tuple.
 *
 * @param {import('../crdt/ORSet.ts').default} orset - The edge OR-Set containing alive edges
 * @param {{from: string, to: string, label: string, dot: import('../crdt/Dot.ts').Dot}} op - The EdgeAdd operation
 * @param {string} edgeKey - Pre-encoded edge key (from\0to\0label format)
 * @returns {OpApplied|OpRedundant} Outcome with encoded edge key as target
 */
function edgeAddOutcome(orset, op, edgeKey) {
  const encoded = encodeDot(op.dot);
  const existingDots = orset.entries.get(edgeKey);
  if (existingDots && existingDots.has(encoded)) {
    return new OpRedundant(edgeKey);
  }
  return new OpApplied(edgeKey);
}

/**
 * Determines the receipt outcome for an EdgeRemove (tombstone) operation.
 *
 * Checks if any of the observed dots exist in the OR-Set and are not yet tombstoned.
 * A remove is only effective if it actually removes at least one existing, non-tombstoned dot.
 * This implements OR-Set remove semantics where removes only affect dots that were
 * observed at the time the remove was issued.
 *
 * The target is computed from the operation's (from, to, label) fields if available,
 * otherwise falls back to '*' for wildcard/unknown targets.
 *
 * @param {import('../crdt/ORSet.ts').default} orset - The edge OR-Set containing alive edges
 * @param {{from?: string, to?: string, label?: string, observedDots: string[] | Set<string>}} op - The EdgeRemove operation
 * @returns {OpApplied|OpRedundant} Outcome with encoded edge key (or '*') as target
 */
function edgeRemoveOutcome(orset, op) {
  // Build a reverse index (dot → elementId) for the observed dots to avoid
  // O(|observedDots| × |entries|) scanning. Same pattern as buildDotToElement.
  const targetDots = op.observedDots instanceof Set
    ? op.observedDots
    : new Set(op.observedDots);
  const dotToElement = buildDotToElement(orset, targetDots);

  let effective = false;
  for (const encodedDot of targetDots) {
    if (!orset.tombstones.has(encodedDot) && dotToElement.has(encodedDot)) {
      effective = true;
      break;
    }
  }
  // Construct target from op fields if available
  const hasEdgeFields = typeof op.from === 'string' && op.from.length > 0
    && typeof op.to === 'string' && op.to.length > 0
    && typeof op.label === 'string' && op.label.length > 0;
  const target = hasEdgeFields
    ? encodeEdgeKey(/** @type {string} */ (op.from), /** @type {string} */ (op.to), /** @type {string} */ (op.label))
    : '*';
  return { target, result: effective ? 'applied' : 'redundant' };
}

/**
 * Determines the receipt outcome for a property operation given a pre-computed key.
 *
 * Uses LWW (Last-Write-Wins) semantics to determine whether the incoming property
 * value wins over any existing value. The comparison is based on EventId ordering:
 * 1. Higher Lamport timestamp wins
 * 2. On tie, higher writer ID wins (lexicographic)
 * 3. On tie, higher patch SHA wins (lexicographic)
 *
 * Possible outcomes:
 * - `applied`: The incoming value wins (no existing value or higher EventId)
 * - `superseded`: An existing value with higher EventId wins
 * - `redundant`: Exact same write (identical EventId)
 *
 * @param {Map<string, import('../crdt/LWW.ts').LWWRegister<unknown>>} propMap - The properties map keyed by encoded prop keys
 * @param {string} key - Pre-encoded property key (node or edge)
 * @param {import('../utils/EventId.ts').EventId} eventId - The event ID for this operation, used for LWW comparison
 * @returns {OpOutcomeResult}
 *          Outcome with encoded prop key as target; includes reason when superseded
 */
function propOutcomeForKey(propMap, key, eventId) {
  const current = propMap.get(key);

  if (!current) {
    return new OpApplied(key);
  }

  const cmp = compareEventIds(eventId, current.eventId);
  if (cmp > 0) {
    return new OpApplied(key);
  }
  if (cmp < 0) {
    const winner = current.eventId;
    return new OpSuperseded(key, winner);
  }
  return new OpRedundant(key);
}

/**
 * Determines the receipt outcome for a PropSet/NodePropSet operation.
 *
 * @param {Map<string, import('../crdt/LWW.ts').LWWRegister<unknown>>} propMap
 * @param {{node: string, key: string}} op - The PropSet or NodePropSet operation
 * @param {import('../utils/EventId.ts').EventId} eventId
 * @returns {OpOutcomeResult}
 */
function propSetOutcome(propMap, op, eventId) {
  return propOutcomeForKey(propMap, encodePropKey(op.node, op.key), eventId);
}

/**
 * Determines the receipt outcome for an EdgePropSet operation.
 *
 * @param {Map<string, import('../crdt/LWW.ts').LWWRegister<unknown>>} propMap
 * @param {{from: string, to: string, label: string, key: string}} op - The EdgePropSet operation
 * @param {import('../utils/EventId.ts').EventId} eventId
 * @returns {OpOutcomeResult}
 */
function edgePropSetOutcome(propMap, op, eventId) {
  return propOutcomeForKey(propMap, encodeEdgePropKey(op.from, op.to, op.label, op.key), eventId);
}

/**
 * Folds a patch's own dot into the observed frontier.
 * @param {import('../crdt/VersionVector.ts').default} frontier
 * @param {string} writer
 * @param {number} lamport
 */
function foldPatchDot(frontier, writer, lamport) {
  const current = frontier.get(writer) ?? 0;
  if (lamport > current) {
    frontier.set(writer, lamport);
  }
}

/**
 * Merges a patch's context into state and folds the patch dot.
 * @param {WarpStateV5} state
 * @param {PatchLike} patch
 */
function updateFrontierFromPatch(state, patch) {
  const contextVV = patch.context instanceof VersionVector
    ? patch.context
    : VersionVector.from(patch.context ?? {});
  state.observedFrontier = state.observedFrontier.merge(contextVV);
  foldPatchDot(state.observedFrontier, patch.writer, patch.lamport);
}

/**
 * Applies a patch to state without receipt collection (zero overhead).
 *
 * @param {WarpStateV5} state - The state to mutate in place
 * @param {PatchLike} patch - The patch to apply
 * @param {string} patchSha - Git SHA of the patch commit
 * @returns {WarpStateV5} The mutated state
 */
export function applyFast(state, patch, patchSha) {
  for (let i = 0; i < patch.ops.length; i++) {
    const op = patch.ops[i];
    if (op === undefined) { continue; }
    const canonOp = normalizeRawOp(op);
    const strategy = OP_STRATEGIES.get(canonOp.type);
    if (!strategy) { continue; }
    strategy.validate(/** @type {OpLikeRecord} */ (canonOp));
    const eventId = createEventId(patch.lamport, patch.writer, patchSha, i);
    strategy.mutate(state, canonOp, eventId);
  }
  updateFrontierFromPatch(state, patch);
  return state;
}

/**
 * Builds a reverse map from dot string → element ID for an OR-Set.
 *
 * Only includes mappings for dots that appear in the given targetDots set,
 * allowing early termination once all target dots are accounted for.
 *
 * @param {import('../crdt/ORSet.ts').default} orset
 * @param {Set<string>} targetDots - The dots we care about
 * @returns {Map<string, string>} dot → elementId
 */
function buildDotToElement(orset, targetDots) {
  /** @type {Map<string, string>} */
  const dotToElement = new Map();
  let remaining = targetDots.size;
  for (const [element, dots] of orset.entries) {
    if (remaining === 0) { break; }
    for (const d of dots) {
      if (targetDots.has(d)) {
        dotToElement.set(d, element);
        remaining--;
        if (remaining === 0) { break; }
      }
    }
  }
  return dotToElement;
}

/**
 * Collects the set of alive elements that own at least one of the target dots.
 *
 * Uses a reverse-index from dot → element to avoid scanning every entry in the
 * OR-Set. Complexity: O(total_dots_in_orset) for index build (with early exit)
 * + O(|targetDots|) for lookups, vs the previous O(N * |targetDots|) full scan.
 *
 * @param {import('../crdt/ORSet.ts').default} orset
 * @param {Set<string>} observedDots
 * @returns {Set<string>} element IDs that were alive and own at least one observed dot
 */
function aliveElementsForDots(orset, observedDots) {
  /** @type {Set<string>} */
  const result = new Set();
  const dotToElement = buildDotToElement(orset, observedDots);
  for (const d of observedDots) {
    const element = dotToElement.get(d);
    if (element !== undefined && !result.has(element) && orset.contains(element)) {
      result.add(element);
    }
  }
  return result;
}

/**
 * @typedef {Object} SnapshotBeforeOp
 * @property {boolean} [nodeWasAlive]
 * @property {boolean} [edgeWasAlive]
 * @property {string} [edgeKey]
 * @property {unknown} [prevPropValue]
 * @property {string} [propKey]
 * @property {Set<string>} [aliveBeforeNodes]
 * @property {Set<string>} [aliveBeforeEdges]
 */

// snapshotBeforeOp and accumulateOpDiff logic now lives in each OpStrategy's
// .snapshot() and .accumulate() methods

/**
 * Records removal only for elements that were alive before AND dead after.
 *
 * @param {import('../types/PatchDiff.ts').PatchDiff} diff
 * @param {WarpStateV5} state
 * @param {SnapshotBeforeOp} before
 */
function collectNodeRemovals(diff, state, before) {
  if (!before.aliveBeforeNodes) { return; }
  for (const element of before.aliveBeforeNodes) {
    if (!state.nodeAlive.contains(element)) {
      diff.nodesRemoved.push(element);
    }
  }
}

/**
 * Records removal only for edges that were alive before AND dead after.
 *
 * @param {import('../types/PatchDiff.ts').PatchDiff} diff
 * @param {WarpStateV5} state
 * @param {SnapshotBeforeOp} before
 */
function collectEdgeRemovals(diff, state, before) {
  if (!before.aliveBeforeEdges) { return; }
  for (const edgeKey of before.aliveBeforeEdges) {
    if (!state.edgeAlive.contains(edgeKey)) {
      diff.edgesRemoved.push(decodeEdgeKey(edgeKey));
    }
  }
}

/**
 * Applies a patch to state with diff tracking for incremental index updates.
 *
 * Captures alive-ness transitions: only records a diff entry when the
 * alive-ness of a node/edge actually changes, or when an LWW property
 * winner changes. Redundant ops produce no diff entries.
 *
 * @param {WarpStateV5} state - The state to mutate in place
 * @param {PatchLike} patch - The patch to apply
 * @param {string} patchSha - Git SHA of the patch commit
 * @returns {{state: WarpStateV5, diff: import('../types/PatchDiff.ts').PatchDiff}}
 */
export function applyWithDiff(state, patch, patchSha) {
  const diff = createEmptyDiff();

  for (let i = 0; i < patch.ops.length; i++) {
    const rawOp = patch.ops[i];
    if (rawOp === undefined) { continue; }
    const canonOp = normalizeRawOp(rawOp);
    const strategy = OP_STRATEGIES.get(canonOp.type);
    if (!strategy) { continue; }
    strategy.validate(/** @type {OpLikeRecord} */ (canonOp));
    const eventId = createEventId(patch.lamport, patch.writer, patchSha, i);
    const before = strategy.snapshot(state, canonOp);
    strategy.mutate(state, canonOp, eventId);
    strategy.accumulate(diff, state, canonOp, before);
  }

  updateFrontierFromPatch(state, patch);
  return { state, diff };
}

/**
 * Applies a patch to state with receipt collection for provenance tracking.
 *
 * @param {WarpStateV5} state - The state to mutate in place
 * @param {PatchLike} patch - The patch to apply
 * @param {string} patchSha - Git SHA of the patch commit
 * @returns {{state: WarpStateV5, receipt: import('../types/TickReceipt.ts').TickReceipt}}
 */
export function applyWithReceipt(state, patch, patchSha) {
  /** @type {import('../types/TickReceipt.ts').OpOutcome[]} */
  const opResults = [];
  for (let i = 0; i < patch.ops.length; i++) {
    const rawOp = patch.ops[i];
    if (rawOp === undefined) { continue; }
    const canonOp = normalizeRawOp(rawOp);
    const strategy = OP_STRATEGIES.get(canonOp.type);
    if (!strategy) { continue; }
    strategy.validate(/** @type {OpLikeRecord} */ (canonOp));
    const eventId = createEventId(patch.lamport, patch.writer, patchSha, i);

    // Determine outcome BEFORE applying the op (state is pre-op)
    const outcome = strategy.outcome(state, canonOp, eventId);

    // Apply the op (mutates state)
    strategy.mutate(state, canonOp, eventId);

    const receiptOp = strategy.receiptName;
    // Skip unknown/forward-compatible op types that aren't valid receipt ops
    if (!VALID_RECEIPT_OPS.has(receiptOp)) {
      continue;
    }
    /** @type {import('../types/TickReceipt.ts').OpOutcome} */
    const entry = { op: receiptOp, target: outcome.target, result: /** @type {'applied'|'superseded'|'redundant'} */ (outcome.result) };
    if (outcome instanceof OpSuperseded && outcome.reason.length > 0) {
      entry.reason = outcome.reason;
    }
    opResults.push(entry);
  }

  updateFrontierFromPatch(state, patch);

  const receipt = createTickReceipt({
    patchSha,
    writer: patch.writer,
    lamport: patch.lamport,
    ops: opResults,
  });

  return { state, receipt };
}

/**
 * Joins a patch into state, applying all operations in order.
 *
 * This is the primary function for incorporating a single patch into WARP state.
 * It iterates through all operations in the patch, creates EventIds for causality
 * tracking, and applies each operation using `applyOpV2`.
 *
 * **Receipt Collection Mode**:
 * When `collectReceipts` is true, this function also computes the outcome of each
 * operation (applied, redundant, or superseded) and returns a TickReceipt for
 * provenance tracking. This has a small performance cost, so it's disabled by default.
 *
 * **Warning**: This function mutates `state` in place. For immutable operations,
 * clone the state first using `cloneStateV5()`.
 *
 * @param {WarpStateV5} state - The state to mutate. Modified in place.
 * @param {PatchLike} patch - The patch to apply
 * @param {string} patchSha - The Git SHA of the patch commit (used for EventId creation)
 * @param {boolean} [collectReceipts=false] - When true, computes and returns receipt data
 * @returns {WarpStateV5|{state: WarpStateV5, receipt: import('../types/TickReceipt.ts').TickReceipt}}
 *          Returns mutated state directly when collectReceipts is false;
 *          returns {state, receipt} object when collectReceipts is true
 */
export function join(state, patch, patchSha, collectReceipts) {
  return collectReceipts === true
    ? applyWithReceipt(state, patch, patchSha)
    : applyFast(state, patch, patchSha);
}

/**
 * Joins two V5 states together using CRDT merge semantics.
 *
 * This function implements the state-based CRDT join operation for WARP state.
 * Each component is merged using its appropriate CRDT join:
 * - `nodeAlive` and `edgeAlive`: OR-Set join (union of dots, tombstones)
 * - `prop`: LWW-Max per property key (higher EventId wins)
 * - `observedFrontier`: Version vector merge (component-wise max)
 * - `edgeBirthEvent`: EventId max per edge key
 *
 * This is a pure function that does not mutate its inputs.
 * The result is deterministic regardless of the order of arguments (commutativity).
 *
 * @param {WarpStateV5} a - First state to merge
 * @param {WarpStateV5} b - Second state to merge
 * @returns {WarpStateV5} New state representing the join of a and b
 */
export function joinStates(a, b) {
  return new WarpStateV5({
    nodeAlive: a.nodeAlive.join(b.nodeAlive),
    edgeAlive: a.edgeAlive.join(b.edgeAlive),
    prop: mergeProps(a.prop, b.prop),
    observedFrontier: a.observedFrontier.merge(b.observedFrontier),
    edgeBirthEvent: mergeEdgeBirthEvent(a.edgeBirthEvent, b.edgeBirthEvent),
  });
}

/**
 * Merges two property maps using LWW-Max semantics per key.
 *
 * For each property key present in either map, the resulting map contains
 * the register with the greater EventId (using LWW comparison). This ensures
 * deterministic merge regardless of the order in which states are joined.
 *
 * This is a pure function that does not mutate its inputs.
 *
 * @param {Map<string, import('../crdt/LWW.ts').LWWRegister<unknown>>} a - First property map
 * @param {Map<string, import('../crdt/LWW.ts').LWWRegister<unknown>>} b - Second property map
 * @returns {Map<string, import('../crdt/LWW.ts').LWWRegister<unknown>>} New map containing merged properties
 */
function mergeProps(a, b) {
  const result = new Map(a);

  for (const [key, regB] of b) {
    const regA = result.get(key);
    result.set(key, /** @type {import('../crdt/LWW.ts').LWWRegister<unknown>} */ (lwwMax(regA, regB)));
  }

  return result;
}

/**
 * Merges two edgeBirthEvent maps by taking the greater EventId per edge key.
 *
 * The edgeBirthEvent map tracks when each edge was most recently added (born),
 * which is used by the query layer to filter out stale properties from previous
 * edge incarnations. When an edge is removed and re-added, properties from
 * before the re-add should not be visible.
 *
 * This function handles null/undefined inputs gracefully, treating them as empty maps.
 * For each edge key present in either map, the resulting map contains the greater
 * EventId (using EventId comparison).
 *
 * This is a pure function that does not mutate its inputs.
 *
 * @param {Map<string, import('../utils/EventId.ts').EventId>|null|undefined} a - First edge birth event map
 * @param {Map<string, import('../utils/EventId.ts').EventId>|null|undefined} b - Second edge birth event map
 * @returns {Map<string, import('../utils/EventId.ts').EventId>} New map containing merged edge birth events
 */
function mergeEdgeBirthEvent(a, b) {
  const result = new Map(a || []);
  if (b) {
    for (const [key, eventId] of b) {
      const existing = result.get(key);
      if (!existing || compareEventIds(eventId, existing) > 0) {
        result.set(key, eventId);
      }
    }
  }
  return result;
}

/**
 * Reduces an array of patches to a V5 state by applying them sequentially.
 *
 * This is the main materialization function that replays a sequence of patches
 * to compute the current graph state. It supports both fresh materialization
 * (starting from empty state) and incremental materialization (starting from
 * a checkpoint state).
 *
 * **Performance Notes**:
 * - When `options.receipts` is false (default), receipt computation is completely
 *   skipped, resulting in zero overhead for the common read path.
 * - When `options.receipts` is true, returns a TickReceipt per patch for
 *   provenance tracking and debugging.
 *
 * @param {Array<{patch: PatchLike, sha: string}>} patches - Array of patch objects with their Git SHAs
 * @param {WarpStateV5} [initialState] - Optional starting state (for incremental materialization from checkpoint)
 * @param {{receipts?: boolean, trackDiff?: boolean}} [options] - Optional configuration
 * @returns {WarpStateV5|{state: WarpStateV5, receipts: import('../types/TickReceipt.ts').TickReceipt[]}|{state: WarpStateV5, diff: import('../types/PatchDiff.ts').PatchDiff}}
 *          Returns state directly when no options;
 *          returns {state, receipts} when receipts is true;
 *          returns {state, diff} when trackDiff is true
 *
 * @note When initialState is provided, the returned diff records transitions
 * relative to that state. The caller must ensure any index tree passed to
 * IncrementalIndexUpdater was built from the same initialState.
 */
export function reduceV5(patches, initialState, options) {
  const state = initialState ? cloneStateV5(initialState) : createEmptyStateV5();

  // ZERO-COST: only check options when provided and truthy
  if (options !== null && options !== undefined && options.receipts === true) {
    const receipts = [];
    for (const { patch, sha } of patches) {
      const result = applyWithReceipt(state, patch, sha);
      receipts.push(result.receipt);
    }
    return { state, receipts };
  }

  if (options !== null && options !== undefined && options.trackDiff === true) {
    let merged = createEmptyDiff();
    for (const { patch, sha } of patches) {
      const { diff } = applyWithDiff(state, patch, sha);
      merged = mergeDiffs(merged, diff);
    }
    return { state, diff: merged };
  }

  for (const { patch, sha } of patches) {
    applyFast(state, patch, sha);
  }
  return state;
}

/**
 * Creates a deep clone of a V5 state.
 *
 * All mutable components are cloned to ensure the returned state is fully
 * independent of the input. This is useful for:
 * - Preserving a checkpoint state before applying more patches
 * - Creating a branch point for speculative execution
 * - Ensuring immutability when passing state across API boundaries
 *
 * **Implementation Note**: OR-Sets are cloned via `.clone()` which
 * directly copies entries and tombstones without merge logic overhead.
 *
 * @param {WarpStateV5} state - The state to clone
 * @returns {WarpStateV5} A new state with identical contents but independent data structures
 */
export function cloneStateV5(state) {
  if (state instanceof WarpStateV5) {
    return state.clone();
  }
  // Structural fallback: normalize plain/deserialized objects into WarpStateV5.
  // This handles checkpoint deserialization and test fixtures that construct
  // state as plain objects.
  const s = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (state));
  return new WarpStateV5({
    nodeAlive: /** @type {import('../crdt/ORSet.ts').default} */ (s['nodeAlive']).clone(),
    edgeAlive: /** @type {import('../crdt/ORSet.ts').default} */ (s['edgeAlive']).clone(),
    prop: new Map(/** @type {Map<string, import('../crdt/LWW.ts').LWWRegister<unknown>>} */ (s['prop'])),
    observedFrontier: /** @type {import('../crdt/VersionVector.ts').default} */ (s['observedFrontier']).clone(),
    edgeBirthEvent: new Map(/** @type {Map<string, import('../utils/EventId.ts').EventId>} */ (s['edgeBirthEvent'] ?? [])),
  });
}
