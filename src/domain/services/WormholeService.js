/**
 * WormholeService - Wormhole Compression for WARP Graphs
 *
 * Implements wormhole compression from Paper III (Computational Holography):
 * Compress multi-tick segments into single edges carrying sub-payloads.
 *
 * A wormhole is a compressed representation of a contiguous range of patches
 * from a single writer. It preserves provenance by storing the original
 * patches as a ProvenancePayload that can be replayed during materialization.
 *
 * ## Key Properties
 *
 * - **Provenance Preservation**: The wormhole contains the full sub-payload,
 *   allowing exact replay of the compressed segment.
 * - **Monoid Composition**: Two consecutive wormholes can be composed by
 *   concatenating their sub-payloads.
 * - **Materialization Equivalence**: A wormhole + remaining patches produces
 *   the same state as materializing all patches.
 *
 * @module domain/services/WormholeService
 */

import ProvenancePayload from './ProvenancePayload.js';
import WormholeError from '../errors/WormholeError.js';
import { detectMessageKind, decodePatchMessage } from './WarpMessageCodec.js';
import { decode } from '../../infrastructure/codecs/CborCodec.js';

/**
 * Validates that a SHA parameter is a non-empty string.
 * @param {*} sha - The SHA to validate
 * @param {string} paramName - Parameter name for error messages
 * @throws {WormholeError} If SHA is invalid
 * @private
 */
function validateSha(sha, paramName) {
  if (!sha || typeof sha !== 'string') {
    throw new WormholeError(`${paramName} is required and must be a string`, {
      code: 'E_WORMHOLE_SHA_NOT_FOUND',
      context: { [paramName]: sha },
    });
  }
}

/**
 * Verifies that a SHA exists in the repository.
 * @param {Object} persistence - Git persistence adapter
 * @param {string} sha - The SHA to verify
 * @param {string} paramName - Parameter name for error messages
 * @throws {WormholeError} If SHA doesn't exist
 * @private
 */
async function verifyShaExists(persistence, sha, paramName) {
  const exists = await persistence.nodeExists(sha);
  if (!exists) {
    throw new WormholeError(`Patch SHA '${sha}' does not exist`, {
      code: 'E_WORMHOLE_SHA_NOT_FOUND',
      context: { sha, which: paramName },
    });
  }
}

/**
 * Processes a single commit in the wormhole chain.
 * @param {Object} opts - Options
 * @param {Object} opts.persistence - Git persistence adapter
 * @param {string} opts.sha - The commit SHA
 * @param {string} opts.graphName - Expected graph name
 * @param {string|null} opts.expectedWriter - Expected writer ID (null for first commit)
 * @returns {Promise<{patch: Object, sha: string, writerId: string, parentSha: string|null}>}
 * @throws {WormholeError} On validation errors
 * @private
 */
async function processCommit({ persistence, sha, graphName, expectedWriter }) {
  const nodeInfo = await persistence.getNodeInfo(sha);
  const { message, parents } = nodeInfo;

  const kind = detectMessageKind(message);
  if (kind !== 'patch') {
    throw new WormholeError(`Commit '${sha}' is not a patch commit (kind: ${kind})`, {
      code: 'E_WORMHOLE_NOT_PATCH',
      context: { sha, kind },
    });
  }

  const patchMeta = decodePatchMessage(message);

  if (patchMeta.graph !== graphName) {
    throw new WormholeError(`Patch '${sha}' belongs to graph '${patchMeta.graph}', not '${graphName}'`, {
      code: 'E_WORMHOLE_INVALID_RANGE',
      context: { sha, expectedGraph: graphName, actualGraph: patchMeta.graph },
    });
  }

  if (expectedWriter !== null && patchMeta.writer !== expectedWriter) {
    throw new WormholeError(`Patches span multiple writers: '${expectedWriter}' and '${patchMeta.writer}'`, {
      code: 'E_WORMHOLE_MULTI_WRITER',
      context: { sha, expectedWriter, actualWriter: patchMeta.writer },
    });
  }

  const patchBuffer = await persistence.readBlob(patchMeta.patchOid);
  const patch = decode(patchBuffer);

  return {
    patch,
    sha,
    writerId: patchMeta.writer,
    parentSha: parents && parents.length > 0 ? parents[0] : null,
  };
}

/**
 * Represents a compressed range of patches (wormhole).
 *
 * A WormholeEdge contains:
 * - The SHA of the first (oldest) patch in the range (fromSha)
 * - The SHA of the last (newest) patch in the range (toSha)
 * - The writer ID who created all patches in the range
 * - A ProvenancePayload containing all patches for replay
 *
 * @typedef {Object} WormholeEdge
 * @property {string} fromSha - SHA of the first (oldest) patch commit
 * @property {string} toSha - SHA of the last (newest) patch commit
 * @property {string} writerId - Writer ID of all patches in the range
 * @property {ProvenancePayload} payload - Sub-payload for replay
 * @property {number} patchCount - Number of patches compressed
 */

/**
 * Creates a wormhole compressing a range of patches.
 *
 * The range is specified by two patch SHAs from the same writer. The `fromSha`
 * must be an ancestor of `toSha` in the writer's patch chain. Both endpoints
 * are inclusive in the wormhole.
 *
 * @param {Object} options - Wormhole creation options
 * @param {import('../../ports/GraphPersistencePort.js').default} options.persistence - Git persistence adapter
 * @param {string} options.graphName - Name of the graph
 * @param {string} options.fromSha - SHA of the first (oldest) patch commit
 * @param {string} options.toSha - SHA of the last (newest) patch commit
 * @returns {Promise<WormholeEdge>} The created wormhole
 * @throws {WormholeError} If fromSha or toSha doesn't exist (E_WORMHOLE_SHA_NOT_FOUND)
 * @throws {WormholeError} If fromSha is not an ancestor of toSha (E_WORMHOLE_INVALID_RANGE)
 * @throws {WormholeError} If commits span multiple writers (E_WORMHOLE_MULTI_WRITER)
 * @throws {WormholeError} If a commit is not a patch commit (E_WORMHOLE_NOT_PATCH)
 */
export async function createWormhole({ persistence, graphName, fromSha, toSha }) {
  validateSha(fromSha, 'fromSha');
  validateSha(toSha, 'toSha');
  await verifyShaExists(persistence, fromSha, 'fromSha');
  await verifyShaExists(persistence, toSha, 'toSha');

  const patches = await collectPatchRange({ persistence, graphName, fromSha, toSha });

  // Reverse to get oldest-first order (as required by ProvenancePayload)
  patches.reverse();

  const writerId = patches.length > 0 ? patches[0].writerId : null;
  // Strip writerId to match ProvenancePayload's PatchEntry typedef ({patch, sha})
  const payload = new ProvenancePayload(patches.map(({ patch, sha }) => ({ patch, sha })));

  return { fromSha, toSha, writerId, payload, patchCount: patches.length };
}

/**
 * Collects patches from toSha back to fromSha (newest-first order).
 * @private
 */
async function collectPatchRange({ persistence, graphName, fromSha, toSha }) {
  const patches = [];
  let currentSha = toSha;
  let writerId = null;

  while (currentSha) {
    const result = await processCommit({ persistence, sha: currentSha, graphName, expectedWriter: writerId });
    writerId = result.writerId;
    patches.push({ patch: result.patch, sha: result.sha, writerId: result.writerId });

    if (currentSha === fromSha) {
      break;
    }

    if (!result.parentSha) {
      throw new WormholeError(`'${fromSha}' is not an ancestor of '${toSha}'`, {
        code: 'E_WORMHOLE_INVALID_RANGE',
        context: { fromSha, toSha },
      });
    }
    currentSha = result.parentSha;
  }

  if (currentSha !== fromSha) {
    throw new WormholeError(`'${fromSha}' is not an ancestor of '${toSha}'`, {
      code: 'E_WORMHOLE_INVALID_RANGE',
      context: { fromSha, toSha },
    });
  }

  if (patches.length === 0) {
    throw new WormholeError('No patches found in the specified range', {
      code: 'E_WORMHOLE_EMPTY_RANGE',
      context: { fromSha, toSha },
    });
  }

  return patches;
}

/**
 * Composes two consecutive wormholes into a single wormhole.
 *
 * The wormholes must be consecutive: the first wormhole's toSha must be
 * the parent of the second wormhole's fromSha.
 *
 * This leverages the ProvenancePayload monoid structure:
 * `composed.payload = first.payload.concat(second.payload)`
 *
 * @param {WormholeEdge} first - The earlier (older) wormhole
 * @param {WormholeEdge} second - The later (newer) wormhole
 * @param {Object} [options] - Composition options
 * @param {import('../../ports/GraphPersistencePort.js').default} [options.persistence] - Git persistence adapter (for validation)
 * @returns {Promise<WormholeEdge>} The composed wormhole
 * @throws {WormholeError} If wormholes are from different writers (E_WORMHOLE_MULTI_WRITER)
 * @throws {WormholeError} If wormholes are not consecutive (E_WORMHOLE_INVALID_RANGE)
 */
export async function composeWormholes(first, second, options = {}) {
  // Validate writer consistency
  if (first.writerId !== second.writerId) {
    throw new WormholeError(`Cannot compose wormholes from different writers: '${first.writerId}' and '${second.writerId}'`, {
      code: 'E_WORMHOLE_MULTI_WRITER',
      context: { firstWriter: first.writerId, secondWriter: second.writerId },
    });
  }

  // If persistence is provided, validate that wormholes are consecutive
  if (options.persistence) {
    const secondFirstInfo = await options.persistence.getNodeInfo(second.fromSha);
    const parents = secondFirstInfo.parents || [];

    if (!parents.includes(first.toSha)) {
      throw new WormholeError('Wormholes are not consecutive', {
        code: 'E_WORMHOLE_INVALID_RANGE',
        context: {
          firstToSha: first.toSha,
          secondFromSha: second.fromSha,
          secondParents: parents,
        },
      });
    }
  }

  // Compose using payload monoid concatenation
  const composedPayload = first.payload.concat(second.payload);

  return {
    fromSha: first.fromSha,
    toSha: second.toSha,
    writerId: first.writerId,
    payload: composedPayload,
    patchCount: first.patchCount + second.patchCount,
  };
}

/**
 * Replays a wormhole's sub-payload to materialize the compressed state.
 *
 * This is equivalent to materializing all the patches in the wormhole
 * individually. The replay uses CRDT merge semantics as defined in JoinReducer.
 *
 * @param {WormholeEdge} wormhole - The wormhole to replay
 * @param {import('./JoinReducer.js').WarpStateV5} [initialState] - Optional initial state
 * @returns {import('./JoinReducer.js').WarpStateV5} The materialized state
 */
export function replayWormhole(wormhole, initialState) {
  return wormhole.payload.replay(initialState);
}

/**
 * Serializes a wormhole to a JSON-serializable object.
 *
 * @param {WormholeEdge} wormhole - The wormhole to serialize
 * @returns {Object} JSON-serializable representation
 */
export function serializeWormhole(wormhole) {
  return {
    fromSha: wormhole.fromSha,
    toSha: wormhole.toSha,
    writerId: wormhole.writerId,
    patchCount: wormhole.patchCount,
    payload: wormhole.payload.toJSON(),
  };
}

/**
 * Deserializes a wormhole from a JSON object.
 *
 * @param {Object} json - The JSON object to deserialize
 * @returns {WormholeEdge} The deserialized wormhole
 * @throws {WormholeError} If the JSON structure is invalid
 */
export function deserializeWormhole(json) {
  // Validate required fields
  if (!json || typeof json !== 'object') {
    throw new WormholeError('Invalid wormhole JSON: expected object', {
      code: 'E_INVALID_WORMHOLE_JSON',
    });
  }

  const requiredFields = ['fromSha', 'toSha', 'writerId', 'patchCount', 'payload'];
  for (const field of requiredFields) {
    if (json[field] === undefined) {
      throw new WormholeError(`Invalid wormhole JSON: missing required field '${field}'`, {
        code: 'E_INVALID_WORMHOLE_JSON',
        context: { missingField: field },
      });
    }
  }

  if (typeof json.patchCount !== 'number' || json.patchCount < 0) {
    throw new WormholeError('Invalid wormhole JSON: patchCount must be a non-negative number', {
      code: 'E_INVALID_WORMHOLE_JSON',
      context: { patchCount: json.patchCount },
    });
  }

  return {
    fromSha: json.fromSha,
    toSha: json.toSha,
    writerId: json.writerId,
    patchCount: json.patchCount,
    payload: ProvenancePayload.fromJSON(json.payload),
  };
}

export default {
  createWormhole,
  composeWormholes,
  replayWormhole,
  serializeWormhole,
  deserializeWormhole,
};
