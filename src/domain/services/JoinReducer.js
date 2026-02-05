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

import { createORSet, orsetAdd, orsetRemove, orsetJoin } from '../crdt/ORSet.js';
import { createVersionVector, vvMerge, vvClone, vvDeserialize } from '../crdt/VersionVector.js';
import { lwwSet, lwwMax } from '../crdt/LWW.js';
import { createEventId, compareEventIds } from '../utils/EventId.js';
import { createTickReceipt, OP_TYPES } from '../types/TickReceipt.js';
import { encodeDot } from '../crdt/Dot.js';

/**
 * Encodes an edge key to a string for Map storage.
 *
 * Edges in WARP are identified by their (from, to, label) triple. This function
 * encodes that triple into a single string using null character (\0) as separator.
 * The resulting string is used as a Map key in the edgeAlive OR-Set.
 *
 * @param {string} from - Source node ID
 * @param {string} to - Target node ID
 * @param {string} label - Edge label/type
 * @returns {string} Encoded edge key in format "from\0to\0label"
 * @see decodeEdgeKey - The inverse operation
 */
export function encodeEdgeKey(from, to, label) {
  return `${from}\0${to}\0${label}`;
}

/**
 * Decodes an edge key string back to its component parts.
 *
 * This is the inverse of `encodeEdgeKey`. It splits the encoded string on null
 * characters to recover the original (from, to, label) triple.
 *
 * @param {string} key - Encoded edge key in format "from\0to\0label"
 * @returns {{from: string, to: string, label: string}} Object with source, target, and label
 * @see encodeEdgeKey - The inverse operation
 */
export function decodeEdgeKey(key) {
  const [from, to, label] = key.split('\0');
  return { from, to, label };
}

/**
 * Encodes a node property key for Map storage.
 *
 * Node properties are keyed by their (nodeId, propKey) pair. This function
 * encodes that pair into a single string using null character (\0) as separator.
 * The resulting string is used as a Map key in the prop LWW register map.
 *
 * @param {string} nodeId - The ID of the node owning the property
 * @param {string} propKey - The property name/key
 * @returns {string} Encoded property key in format "nodeId\0propKey"
 * @see decodePropKey - The inverse operation
 * @see encodeEdgePropKey - For edge properties (uses different format)
 */
export function encodePropKey(nodeId, propKey) {
  return `${nodeId}\0${propKey}`;
}

/**
 * Decodes a node property key string back to its component parts.
 *
 * This is the inverse of `encodePropKey`. It splits the encoded string on null
 * characters to recover the original (nodeId, propKey) pair.
 *
 * @param {string} key - Encoded property key in format "nodeId\0propKey"
 * @returns {{nodeId: string, propKey: string}} Object with node ID and property key
 * @see encodePropKey - The inverse operation
 */
export function decodePropKey(key) {
  const [nodeId, propKey] = key.split('\0');
  return { nodeId, propKey };
}

/**
 * Prefix byte for edge property keys. Guarantees no collision with node
 * property keys (which start with a node-ID character, never \x01).
 * @const {string}
 */
export const EDGE_PROP_PREFIX = '\x01';

/**
 * Encodes an edge property key for Map storage.
 *
 * Format: `\x01from\0to\0label\0propKey`
 *
 * The \x01 prefix guarantees collision-freedom with node property keys
 * (format `nodeId\0propKey`) since node IDs never start with \x01.
 *
 * @param {string} from - Source node ID
 * @param {string} to - Target node ID
 * @param {string} label - Edge label
 * @param {string} propKey - Property name
 * @warning Fields must not contain the null character (\0) as it is used as the internal separator.
 * @returns {string}
 */
export function encodeEdgePropKey(from, to, label, propKey) {
  return `${EDGE_PROP_PREFIX}${from}\0${to}\0${label}\0${propKey}`;
}

/**
 * Returns true if the encoded key is an edge property key.
 * @param {string} key - Encoded property key
 * @returns {boolean}
 */
export function isEdgePropKey(key) {
  return key[0] === EDGE_PROP_PREFIX;
}

/**
 * Decodes an edge property key string.
 * @param {string} encoded - Encoded edge property key (must start with \x01)
 * @returns {{from: string, to: string, label: string, propKey: string}}
 * @throws {Error} If the encoded key is missing the edge property prefix
 * @throws {Error} If the encoded key does not contain exactly 4 segments
 */
export function decodeEdgePropKey(encoded) {
  if (!isEdgePropKey(encoded)) {
    throw new Error('Invalid edge property key: missing prefix');
  }
  const [from, to, label, propKey] = encoded.slice(1).split('\0');
  if (propKey === undefined) {
    throw new Error('Invalid edge property key: expected 4 segments');
  }
  return { from, to, label, propKey };
}

/**
 * @typedef {Object} WarpStateV5
 * @property {import('../crdt/ORSet.js').ORSet} nodeAlive - ORSet of alive nodes
 * @property {import('../crdt/ORSet.js').ORSet} edgeAlive - ORSet of alive edges
 * @property {Map<string, import('../crdt/LWW.js').LWWRegister>} prop - Properties with LWW
 * @property {import('../crdt/VersionVector.js').VersionVector} observedFrontier - Observed version vector
 * @property {Map<string, import('../utils/EventId.js').EventId>} edgeBirthEvent - EdgeKey → EventId of most recent EdgeAdd (for clean-slate prop visibility)
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
  return {
    nodeAlive: createORSet(),
    edgeAlive: createORSet(),
    prop: new Map(),
    observedFrontier: createVersionVector(),
    edgeBirthEvent: new Map(),
  };
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
 * - Unknown types: Silently ignored for forward compatibility
 *
 * **Warning**: This function mutates `state` in place. For immutable operations,
 * clone the state first using `cloneStateV5()`.
 *
 * @param {WarpStateV5} state - The state to mutate. Modified in place.
 * @param {Object} op - The operation to apply
 * @param {string} op.type - One of: 'NodeAdd', 'NodeRemove', 'EdgeAdd', 'EdgeRemove', 'PropSet'
 * @param {string} [op.node] - Node ID (for NodeAdd, NodeRemove, PropSet)
 * @param {import('../crdt/Dot.js').Dot} [op.dot] - Dot identifier (for NodeAdd, EdgeAdd)
 * @param {string[]} [op.observedDots] - Encoded dots to remove (for NodeRemove, EdgeRemove)
 * @param {string} [op.from] - Source node ID (for EdgeAdd, EdgeRemove)
 * @param {string} [op.to] - Target node ID (for EdgeAdd, EdgeRemove)
 * @param {string} [op.label] - Edge label (for EdgeAdd, EdgeRemove)
 * @param {string} [op.key] - Property key (for PropSet)
 * @param {*} [op.value] - Property value (for PropSet)
 * @param {import('../utils/EventId.js').EventId} eventId - Event ID for causality tracking
 * @returns {void}
 */
export function applyOpV2(state, op, eventId) {
  switch (op.type) {
    case 'NodeAdd':
      orsetAdd(state.nodeAlive, op.node, op.dot);
      break;
    case 'NodeRemove':
      orsetRemove(state.nodeAlive, op.observedDots);
      break;
    case 'EdgeAdd': {
      const edgeKey = encodeEdgeKey(op.from, op.to, op.label);
      orsetAdd(state.edgeAlive, edgeKey, op.dot);
      // Track the EventId at which this edge incarnation was born.
      // On re-add after remove, the greater EventId replaces the old one,
      // allowing the query layer to filter out stale properties.
      if (state.edgeBirthEvent) {
        const prev = state.edgeBirthEvent.get(edgeKey);
        if (!prev || compareEventIds(eventId, prev) > 0) {
          state.edgeBirthEvent.set(edgeKey, eventId);
        }
      }
      break;
    }
    case 'EdgeRemove':
      orsetRemove(state.edgeAlive, op.observedDots);
      break;
    case 'PropSet': {
      // Uses EventId-based LWW, same as v4
      const key = encodePropKey(op.node, op.key);
      const current = state.prop.get(key);
      state.prop.set(key, lwwMax(current, lwwSet(eventId, op.value)));
      break;
    }
    default:
      // Unknown op types are silently ignored (forward-compat)
      break;
  }
}

/**
 * Maps internal operation type names to TickReceipt-compatible operation type names.
 *
 * The internal representation uses "Remove" for tombstone operations, but the
 * TickReceipt API uses "Tombstone" to be more explicit about CRDT semantics.
 * This mapping ensures receipt consumers see the canonical operation names.
 *
 * Mappings:
 * - NodeRemove -> NodeTombstone (CRDT tombstone semantics)
 * - EdgeRemove -> EdgeTombstone (CRDT tombstone semantics)
 * - All others pass through unchanged
 *
 * @const {Object<string, string>}
 */
const RECEIPT_OP_TYPE = {
  NodeAdd: 'NodeAdd',
  NodeRemove: 'NodeTombstone',
  EdgeAdd: 'EdgeAdd',
  EdgeRemove: 'EdgeTombstone',
  PropSet: 'PropSet',
  BlobValue: 'BlobValue',
};

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
 * @param {import('../crdt/ORSet.js').ORSet} orset - The node OR-Set containing alive nodes
 * @param {Object} op - The NodeAdd operation
 * @param {string} op.node - The node ID being added
 * @param {import('../crdt/Dot.js').Dot} op.dot - The dot uniquely identifying this add event
 * @returns {{target: string, result: 'applied'|'redundant'}} Outcome with node ID as target
 */
function nodeAddOutcome(orset, op) {
  const encoded = encodeDot(op.dot);
  const existingDots = orset.entries.get(op.node);
  if (existingDots && existingDots.has(encoded)) {
    return { target: op.node, result: 'redundant' };
  }
  return { target: op.node, result: 'applied' };
}

/**
 * Determines the receipt outcome for a NodeRemove (tombstone) operation.
 *
 * Checks if any of the observed dots exist in the OR-Set and are not yet tombstoned.
 * A remove is only effective if it actually removes at least one existing, non-tombstoned dot.
 * This implements OR-Set remove semantics where removes only affect dots that were
 * observed at the time the remove was issued.
 *
 * @param {import('../crdt/ORSet.js').ORSet} orset - The node OR-Set containing alive nodes
 * @param {Object} op - The NodeRemove operation
 * @param {string} [op.node] - The node ID being removed (may be absent for dot-only removes)
 * @param {string[]} op.observedDots - Array of encoded dots that were observed when the remove was issued
 * @returns {{target: string, result: 'applied'|'redundant'}} Outcome with node ID (or '*') as target
 */
function nodeRemoveOutcome(orset, op) {
  // Check if any of the observed dots are currently non-tombstoned
  let effective = false;
  for (const encodedDot of op.observedDots) {
    if (!orset.tombstones.has(encodedDot)) {
      // This dot exists and is not yet tombstoned, so the remove is effective
      // Check if any entry actually has this dot
      for (const dots of orset.entries.values()) {
        if (dots.has(encodedDot)) {
          effective = true;
          break;
        }
      }
      if (effective) {
        break;
      }
    }
  }
  const target = op.node || '*';
  return { target, result: effective ? 'applied' : 'redundant' };
}

/**
 * Determines the receipt outcome for an EdgeAdd operation.
 *
 * Checks if the edge's dot already exists in the OR-Set to determine whether
 * this add operation is effective or redundant (idempotent re-delivery).
 * Unlike nodes, edges are keyed by the composite (from, to, label) tuple.
 *
 * @param {import('../crdt/ORSet.js').ORSet} orset - The edge OR-Set containing alive edges
 * @param {Object} op - The EdgeAdd operation
 * @param {string} op.from - Source node ID
 * @param {string} op.to - Target node ID
 * @param {string} op.label - Edge label
 * @param {import('../crdt/Dot.js').Dot} op.dot - The dot uniquely identifying this add event
 * @param {string} edgeKey - Pre-encoded edge key (from\0to\0label format)
 * @returns {{target: string, result: 'applied'|'redundant'}} Outcome with encoded edge key as target
 */
function edgeAddOutcome(orset, op, edgeKey) {
  const encoded = encodeDot(op.dot);
  const existingDots = orset.entries.get(edgeKey);
  if (existingDots && existingDots.has(encoded)) {
    return { target: edgeKey, result: 'redundant' };
  }
  return { target: edgeKey, result: 'applied' };
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
 * @param {import('../crdt/ORSet.js').ORSet} orset - The edge OR-Set containing alive edges
 * @param {Object} op - The EdgeRemove operation
 * @param {string} [op.from] - Source node ID (optional for computing target)
 * @param {string} [op.to] - Target node ID (optional for computing target)
 * @param {string} [op.label] - Edge label (optional for computing target)
 * @param {string[]} op.observedDots - Array of encoded dots that were observed when the remove was issued
 * @returns {{target: string, result: 'applied'|'redundant'}} Outcome with encoded edge key (or '*') as target
 */
function edgeRemoveOutcome(orset, op) {
  let effective = false;
  for (const encodedDot of op.observedDots) {
    if (!orset.tombstones.has(encodedDot)) {
      for (const dots of orset.entries.values()) {
        if (dots.has(encodedDot)) {
          effective = true;
          break;
        }
      }
      if (effective) {
        break;
      }
    }
  }
  // Construct target from op fields if available
  const target = (op.from && op.to && op.label)
    ? encodeEdgeKey(op.from, op.to, op.label)
    : '*';
  return { target, result: effective ? 'applied' : 'redundant' };
}

/**
 * Determines the receipt outcome for a PropSet operation.
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
 * @param {Map<string, import('../crdt/LWW.js').LWWRegister>} propMap - The properties map keyed by encoded prop keys
 * @param {Object} op - The PropSet operation
 * @param {string} op.node - Node ID owning the property
 * @param {string} op.key - Property key/name
 * @param {*} op.value - Property value to set
 * @param {import('../utils/EventId.js').EventId} eventId - The event ID for this operation, used for LWW comparison
 * @returns {{target: string, result: 'applied'|'superseded'|'redundant', reason?: string}}
 *          Outcome with encoded prop key as target; includes reason when superseded
 */
function propSetOutcome(propMap, op, eventId) {
  const key = encodePropKey(op.node, op.key);
  const current = propMap.get(key);
  const target = key;

  if (!current) {
    // No existing value -- this write wins
    return { target, result: 'applied' };
  }

  // Compare the incoming EventId with the existing register's EventId
  const cmp = compareEventIds(eventId, current.eventId);
  if (cmp > 0) {
    // Incoming write wins
    return { target, result: 'applied' };
  }
  if (cmp < 0) {
    // Existing write wins
    const winner = current.eventId;
    return {
      target,
      result: 'superseded',
      reason: `LWW: writer ${winner.writerId} at lamport ${winner.lamport} wins`,
    };
  }
  // Same EventId -- redundant (exact same write)
  return { target, result: 'redundant' };
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
 * @param {Object} patch - The patch to apply
 * @param {string} patch.writer - Writer ID who created this patch
 * @param {number} patch.lamport - Lamport timestamp of this patch
 * @param {Object[]} patch.ops - Array of operations to apply
 * @param {Map|Object} patch.context - Version vector context (Map or serialized form)
 * @param {string} patchSha - The Git SHA of the patch commit (used for EventId creation)
 * @param {boolean} [collectReceipts=false] - When true, computes and returns receipt data
 * @returns {WarpStateV5|{state: WarpStateV5, receipt: import('../types/TickReceipt.js').TickReceipt}}
 *          Returns mutated state directly when collectReceipts is false;
 *          returns {state, receipt} object when collectReceipts is true
 */
export function join(state, patch, patchSha, collectReceipts) {
  // ZERO-COST: when collectReceipts is falsy, skip all receipt logic
  if (!collectReceipts) {
    for (let i = 0; i < patch.ops.length; i++) {
      const eventId = createEventId(patch.lamport, patch.writer, patchSha, i);
      applyOpV2(state, patch.ops[i], eventId);
    }
    const contextVV = patch.context instanceof Map
      ? patch.context
      : vvDeserialize(patch.context);
    state.observedFrontier = vvMerge(state.observedFrontier, contextVV);
    return state;
  }

  // Receipt-enabled path
  const opResults = [];
  for (let i = 0; i < patch.ops.length; i++) {
    const op = patch.ops[i];
    const eventId = createEventId(patch.lamport, patch.writer, patchSha, i);

    // Determine outcome BEFORE applying the op (state is pre-op)
    let outcome;
    switch (op.type) {
      case 'NodeAdd':
        outcome = nodeAddOutcome(state.nodeAlive, op);
        break;
      case 'NodeRemove':
        outcome = nodeRemoveOutcome(state.nodeAlive, op);
        break;
      case 'EdgeAdd': {
        const edgeKey = encodeEdgeKey(op.from, op.to, op.label);
        outcome = edgeAddOutcome(state.edgeAlive, op, edgeKey);
        break;
      }
      case 'EdgeRemove':
        outcome = edgeRemoveOutcome(state.edgeAlive, op);
        break;
      case 'PropSet':
        outcome = propSetOutcome(state.prop, op, eventId);
        break;
      default:
        // Unknown or BlobValue — always applied
        outcome = { target: op.node || op.oid || '*', result: 'applied' };
        break;
    }

    // Apply the op (mutates state)
    applyOpV2(state, op, eventId);

    const receiptOp = RECEIPT_OP_TYPE[op.type] || op.type;
    // Skip unknown/forward-compatible op types that aren't valid receipt ops
    if (!VALID_RECEIPT_OPS.has(receiptOp)) {
      continue;
    }
    const entry = { op: receiptOp, target: outcome.target, result: outcome.result };
    if (outcome.reason) {
      entry.reason = outcome.reason;
    }
    opResults.push(entry);
  }

  const contextVV = patch.context instanceof Map
    ? patch.context
    : vvDeserialize(patch.context);
  state.observedFrontier = vvMerge(state.observedFrontier, contextVV);

  const receipt = createTickReceipt({
    patchSha,
    writer: patch.writer,
    lamport: patch.lamport,
    ops: opResults,
  });

  return { state, receipt };
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
  return {
    nodeAlive: orsetJoin(a.nodeAlive, b.nodeAlive),
    edgeAlive: orsetJoin(a.edgeAlive, b.edgeAlive),
    prop: mergeProps(a.prop, b.prop),
    observedFrontier: vvMerge(a.observedFrontier, b.observedFrontier),
    edgeBirthEvent: mergeEdgeBirthEvent(a.edgeBirthEvent, b.edgeBirthEvent),
  };
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
 * @param {Map<string, import('../crdt/LWW.js').LWWRegister>} a - First property map
 * @param {Map<string, import('../crdt/LWW.js').LWWRegister>} b - Second property map
 * @returns {Map<string, import('../crdt/LWW.js').LWWRegister>} New map containing merged properties
 */
function mergeProps(a, b) {
  const result = new Map(a);

  for (const [key, regB] of b) {
    const regA = result.get(key);
    result.set(key, lwwMax(regA, regB));
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
 * @param {Map<string, import('../utils/EventId.js').EventId>|null|undefined} a - First edge birth event map
 * @param {Map<string, import('../utils/EventId.js').EventId>|null|undefined} b - Second edge birth event map
 * @returns {Map<string, import('../utils/EventId.js').EventId>} New map containing merged edge birth events
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
 * @param {Array<{patch: Object, sha: string}>} patches - Array of patch objects with their Git SHAs
 * @param {Object} patches[].patch - The decoded patch object (writer, lamport, ops, context)
 * @param {string} patches[].sha - The Git SHA of the patch commit
 * @param {WarpStateV5} [initialState] - Optional starting state (for incremental materialization from checkpoint)
 * @param {Object} [options] - Optional configuration
 * @param {boolean} [options.receipts=false] - When true, collect and return TickReceipts
 * @returns {WarpStateV5|{state: WarpStateV5, receipts: import('../types/TickReceipt.js').TickReceipt[]}}
 *          Returns state directly when receipts is false;
 *          returns {state, receipts} when receipts is true
 */
export function reduceV5(patches, initialState, options) {
  const state = initialState ? cloneStateV5(initialState) : createEmptyStateV5();

  // ZERO-COST: only check options when provided and truthy
  if (options && options.receipts) {
    const receipts = [];
    for (const { patch, sha } of patches) {
      const result = join(state, patch, sha, true);
      receipts.push(result.receipt);
    }
    return { state, receipts };
  }

  for (const { patch, sha } of patches) {
    join(state, patch, sha);
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
 * **Implementation Note**: OR-Sets are cloned by joining with an empty set,
 * which creates new data structures with identical contents.
 *
 * @param {WarpStateV5} state - The state to clone
 * @returns {WarpStateV5} A new state with identical contents but independent data structures
 */
export function cloneStateV5(state) {
  return {
    nodeAlive: orsetJoin(state.nodeAlive, createORSet()),
    edgeAlive: orsetJoin(state.edgeAlive, createORSet()),
    prop: new Map(state.prop),
    observedFrontier: vvClone(state.observedFrontier),
    edgeBirthEvent: new Map(state.edgeBirthEvent || []),
  };
}
