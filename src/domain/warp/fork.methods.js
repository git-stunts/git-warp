/**
 * Fork and wormhole methods for WarpGraph, plus backfill-rejection helpers.
 *
 * Every function uses `this` bound to a WarpGraph instance at runtime
 * via wireWarpMethods().
 *
 * @module domain/warp/fork.methods
 */

import { ForkError, DEFAULT_ADJACENCY_CACHE_SIZE } from './_internal.js';
import { validateGraphName, validateWriterId, buildWriterRef, buildWritersPrefix } from '../utils/RefLayout.js';
import { generateWriterId } from '../utils/WriterId.js';
import { createWormhole as createWormholeImpl } from '../services/WormholeService.js';

// ============================================================================
// Fork API
// ============================================================================

/**
 * Creates a fork of this graph at a specific point in a writer's history.
 *
 * A fork creates a new WarpGraph instance that shares history up to the
 * specified patch SHA. Due to Git's content-addressed storage, the shared
 * history is automatically deduplicated. The fork gets a new writer ID and
 * operates independently from the original graph.
 *
 * **Key Properties:**
 * - Fork materializes the same state as the original at the fork point
 * - Writes to the fork don't appear in the original
 * - Writes to the original after fork don't appear in the fork
 * - History up to the fork point is shared (content-addressed dedup)
 *
 * @this {import('../WarpGraph.js').default}
 * @param {Object} options - Fork configuration
 * @param {string} options.from - Writer ID whose chain to fork from
 * @param {string} options.at - Patch SHA to fork at (must be in the writer's chain)
 * @param {string} [options.forkName] - Name for the forked graph. Defaults to `<graphName>-fork-<timestamp>`
 * @param {string} [options.forkWriterId] - Writer ID for the fork. Defaults to a new canonical ID.
 * @returns {Promise<import('../WarpGraph.js').default>} A new WarpGraph instance for the fork
 * @throws {ForkError} If `from` writer does not exist (code: `E_FORK_WRITER_NOT_FOUND`)
 * @throws {ForkError} If `at` SHA does not exist (code: `E_FORK_PATCH_NOT_FOUND`)
 * @throws {ForkError} If `at` SHA is not in the writer's chain (code: `E_FORK_PATCH_NOT_IN_CHAIN`)
 * @throws {ForkError} If fork graph name is invalid (code: `E_FORK_NAME_INVALID`)
 * @throws {ForkError} If a graph with the fork name already has refs (code: `E_FORK_ALREADY_EXISTS`)
 * @throws {ForkError} If required parameters are missing or invalid (code: `E_FORK_INVALID_ARGS`)
 * @throws {ForkError} If forkWriterId is invalid (code: `E_FORK_WRITER_ID_INVALID`)
 */
export async function fork({ from, at, forkName, forkWriterId }) {
  const t0 = this._clock.now();

  try {
    // Validate required parameters
    if (!from || typeof from !== 'string') {
      throw new ForkError("Required parameter 'from' is missing or not a string", {
        code: 'E_FORK_INVALID_ARGS',
        context: { from },
      });
    }

    if (!at || typeof at !== 'string') {
      throw new ForkError("Required parameter 'at' is missing or not a string", {
        code: 'E_FORK_INVALID_ARGS',
        context: { at },
      });
    }

    // 1. Validate that the `from` writer exists
    const writers = await this.discoverWriters();
    if (!writers.includes(from)) {
      throw new ForkError(`Writer '${from}' does not exist in graph '${this._graphName}'`, {
        code: 'E_FORK_WRITER_NOT_FOUND',
        context: { writerId: from, graphName: this._graphName, existingWriters: writers },
      });
    }

    // 2. Validate that `at` SHA exists in the repository
    const nodeExists = await this._persistence.nodeExists(at);
    if (!nodeExists) {
      throw new ForkError(`Patch SHA '${at}' does not exist`, {
        code: 'E_FORK_PATCH_NOT_FOUND',
        context: { patchSha: at, writerId: from },
      });
    }

    // 3. Validate that `at` SHA is in the writer's chain
    const writerRef = buildWriterRef(this._graphName, from);
    const tipSha = await this._persistence.readRef(writerRef);

    if (!tipSha) {
      throw new ForkError(`Writer '${from}' has no commits`, {
        code: 'E_FORK_WRITER_NOT_FOUND',
        context: { writerId: from },
      });
    }

    // Walk the chain to verify `at` is reachable from the tip
    const isInChain = await this._isAncestor(at, tipSha);
    if (!isInChain) {
      throw new ForkError(`Patch SHA '${at}' is not in writer '${from}' chain`, {
        code: 'E_FORK_PATCH_NOT_IN_CHAIN',
        context: { patchSha: at, writerId: from, tipSha },
      });
    }

    // 4. Generate or validate fork name (add random suffix to prevent collisions)
    const resolvedForkName =
      forkName ?? `${this._graphName}-fork-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    try {
      validateGraphName(resolvedForkName);
    } catch (err) {
      throw new ForkError(`Invalid fork name: ${/** @type {Error} */ (err).message}`, {
        code: 'E_FORK_NAME_INVALID',
        context: { forkName: resolvedForkName, originalError: /** @type {Error} */ (err).message },
      });
    }

    // 5. Check that the fork graph doesn't already exist (has any refs)
    const forkWritersPrefix = buildWritersPrefix(resolvedForkName);
    const existingForkRefs = await this._persistence.listRefs(forkWritersPrefix);
    if (existingForkRefs.length > 0) {
      throw new ForkError(`Graph '${resolvedForkName}' already exists`, {
        code: 'E_FORK_ALREADY_EXISTS',
        context: { forkName: resolvedForkName, existingRefs: existingForkRefs },
      });
    }

    // 6. Generate or validate fork writer ID
    const resolvedForkWriterId = forkWriterId || generateWriterId();
    try {
      validateWriterId(resolvedForkWriterId);
    } catch (err) {
      throw new ForkError(`Invalid fork writer ID: ${/** @type {Error} */ (err).message}`, {
        code: 'E_FORK_WRITER_ID_INVALID',
        context: { forkWriterId: resolvedForkWriterId, originalError: /** @type {Error} */ (err).message },
      });
    }

    // 7. Create the fork's writer ref pointing to the `at` commit
    const forkWriterRef = buildWriterRef(resolvedForkName, resolvedForkWriterId);
    await this._persistence.updateRef(forkWriterRef, at);

    // 8. Open and return a new WarpGraph instance for the fork
    // Dynamic import to avoid circular dependency (WarpGraph -> fork.methods -> WarpGraph)
    const { default: WarpGraph } = await import('../WarpGraph.js');

    const forkGraph = await WarpGraph.open({
      persistence: this._persistence,
      graphName: resolvedForkName,
      writerId: resolvedForkWriterId,
      gcPolicy: this._gcPolicy,
      adjacencyCacheSize: this._adjacencyCache?.maxSize ?? DEFAULT_ADJACENCY_CACHE_SIZE,
      checkpointPolicy: this._checkpointPolicy || undefined,
      autoMaterialize: this._autoMaterialize,
      onDeleteWithData: this._onDeleteWithData,
      logger: this._logger || undefined,
      clock: this._clock,
      crypto: this._crypto,
      codec: this._codec,
    });

    this._logTiming('fork', t0, {
      metrics: `from=${from} at=${at.slice(0, 7)} name=${resolvedForkName}`,
    });

    return forkGraph;
  } catch (err) {
    this._logTiming('fork', t0, { error: /** @type {Error} */ (err) });
    throw err;
  }
}

// ============================================================================
// Wormhole API (HOLOGRAM)
// ============================================================================

/**
 * Creates a wormhole compressing a range of patches.
 *
 * A wormhole is a compressed representation of a contiguous range of patches
 * from a single writer. It preserves provenance by storing the original
 * patches as a ProvenancePayload that can be replayed during materialization.
 *
 * **Key Properties:**
 * - **Provenance Preservation**: The wormhole contains the full sub-payload,
 *   allowing exact replay of the compressed segment.
 * - **Monoid Composition**: Two consecutive wormholes can be composed by
 *   concatenating their sub-payloads (use `WormholeService.composeWormholes`).
 * - **Materialization Equivalence**: A wormhole + remaining patches produces
 *   the same state as materializing all patches.
 *
 * @this {import('../WarpGraph.js').default}
 * @param {string} fromSha - SHA of the first (oldest) patch commit in the range
 * @param {string} toSha - SHA of the last (newest) patch commit in the range
 * @returns {Promise<{fromSha: string, toSha: string, writerId: string, payload: import('../services/ProvenancePayload.js').default, patchCount: number}>} The created wormhole edge
 * @throws {import('../errors/WormholeError.js').default} If fromSha or toSha doesn't exist (E_WORMHOLE_SHA_NOT_FOUND)
 * @throws {import('../errors/WormholeError.js').default} If fromSha is not an ancestor of toSha (E_WORMHOLE_INVALID_RANGE)
 * @throws {import('../errors/WormholeError.js').default} If commits span multiple writers (E_WORMHOLE_MULTI_WRITER)
 * @throws {import('../errors/WormholeError.js').default} If a commit is not a patch commit (E_WORMHOLE_NOT_PATCH)
 */
export async function createWormhole(fromSha, toSha) {
  const t0 = this._clock.now();

  try {
    const wormhole = await createWormholeImpl({
      persistence: this._persistence,
      graphName: this._graphName,
      fromSha,
      toSha,
      codec: this._codec,
    });

    this._logTiming('createWormhole', t0, {
      metrics: `${wormhole.patchCount} patches from=${fromSha.slice(0, 7)} to=${toSha.slice(0, 7)}`,
    });

    return wormhole;
  } catch (err) {
    this._logTiming('createWormhole', t0, { error: /** @type {Error} */ (err) });
    throw err;
  }
}

// ============================================================================
// Backfill Rejection and Divergence Detection
// ============================================================================

/**
 * Checks if ancestorSha is an ancestor of descendantSha.
 * Walks the commit graph (linear per-writer chain assumption).
 *
 * @this {import('../WarpGraph.js').default}
 * @param {string} ancestorSha - The potential ancestor commit SHA
 * @param {string} descendantSha - The potential descendant commit SHA
 * @returns {Promise<boolean>} True if ancestorSha is an ancestor of descendantSha
 * @private
 */
export async function _isAncestor(ancestorSha, descendantSha) {
  if (!ancestorSha || !descendantSha) {
    return false;
  }
  if (ancestorSha === descendantSha) {
    return true;
  }

  let cur = descendantSha;
  const MAX_WALK = 100_000;
  let steps = 0;
  while (cur) {
    if (++steps > MAX_WALK) {
      throw new Error(`_isAncestor: exceeded ${MAX_WALK} steps — possible cycle`);
    }
    const nodeInfo = await this._persistence.getNodeInfo(cur);
    const parent = nodeInfo.parents?.[0] ?? null;
    if (parent === ancestorSha) {
      return true;
    }
    cur = parent;
  }
  return false;
}

/**
 * Determines relationship between incoming patch and checkpoint head.
 *
 * @this {import('../WarpGraph.js').default}
 * @param {string} ckHead - The checkpoint head SHA for this writer
 * @param {string} incomingSha - The incoming patch commit SHA
 * @returns {Promise<'same' | 'ahead' | 'behind' | 'diverged'>} The relationship
 * @private
 */
export async function _relationToCheckpointHead(ckHead, incomingSha) {
  if (incomingSha === ckHead) {
    return 'same';
  }
  if (await this._isAncestor(ckHead, incomingSha)) {
    return 'ahead';
  }
  if (await this._isAncestor(incomingSha, ckHead)) {
    return 'behind';
  }
  return 'diverged';
}

/**
 * Validates an incoming patch against checkpoint frontier.
 * Uses graph reachability, NOT lamport timestamps.
 *
 * @this {import('../WarpGraph.js').default}
 * @param {string} writerId - The writer ID for this patch
 * @param {string} incomingSha - The incoming patch commit SHA
 * @param {{state: import('../services/JoinReducer.js').WarpStateV5, frontier: Map<string, string>, stateHash: string, schema: number}} checkpoint - The checkpoint to validate against
 * @returns {Promise<void>}
 * @throws {Error} If patch is behind/same as checkpoint frontier (backfill rejected)
 * @throws {Error} If patch does not extend checkpoint head (writer fork detected)
 * @private
 */
export async function _validatePatchAgainstCheckpoint(writerId, incomingSha, checkpoint) {
  if (!checkpoint || (checkpoint.schema !== 2 && checkpoint.schema !== 3)) {
    return;
  }

  const ckHead = checkpoint.frontier?.get(writerId);
  if (!ckHead) {
    return;  // Checkpoint didn't include this writer
  }

  const relation = await this._relationToCheckpointHead(ckHead, incomingSha);

  if (relation === 'same' || relation === 'behind') {
    throw new Error(
      `Backfill rejected for writer ${writerId}: ` +
      `incoming patch is ${relation} checkpoint frontier`
    );
  }

  if (relation === 'diverged') {
    throw new Error(
      `Writer fork detected for ${writerId}: ` +
      `incoming patch does not extend checkpoint head`
    );
  }
  // relation === 'ahead' => OK
}
