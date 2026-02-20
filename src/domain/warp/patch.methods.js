/**
 * Patch/writer methods for WarpGraph — state mutation, writer lifecycle,
 * discovery, and CRDT join.
 *
 * Every function uses `this` bound to a WarpGraph instance at runtime
 * via wireWarpMethods().
 *
 * @module domain/warp/patch.methods
 */

import { QueryError, E_NO_STATE_MSG, E_STALE_STATE_MSG } from './_internal.js';
import { PatchBuilderV2 } from '../services/PatchBuilderV2.js';
import { joinStates, join as joinPatch } from '../services/JoinReducer.js';
import { orsetElements } from '../crdt/ORSet.js';
import { vvIncrement } from '../crdt/VersionVector.js';
import { buildWriterRef, buildWritersPrefix, parseWriterIdFromRef } from '../utils/RefLayout.js';
import { decodePatchMessage, detectMessageKind } from '../services/WarpMessageCodec.js';
import { Writer } from './Writer.js';
import { generateWriterId, resolveWriterId } from '../utils/WriterId.js';

/** @typedef {import('../types/WarpPersistence.js').CorePersistence} CorePersistence */

/**
 * Creates a new PatchBuilderV2 for this graph.
 *
 * In multi-writer scenarios, call `materialize()` (or a query method that
 * auto-materializes) before creating a patch so that `_maxObservedLamport`
 * reflects all known writers. Without this, `_nextLamport()` still produces
 * locally-monotonic ticks (`Math.max(ownTick, _maxObservedLamport) + 1`),
 * and `PatchBuilderV2.commit()` re-reads the writer's own ref at commit
 * time, so correctness is preserved — but the tick may be lower than
 * necessary, losing LWW tiebreakers against other writers.
 *
 * @this {import('../WarpGraph.js').default}
 * @returns {Promise<PatchBuilderV2>} A new patch builder
 */
export async function createPatch() {
  const { lamport, parentSha } = await this._nextLamport();
  return new PatchBuilderV2({
    persistence: this._persistence,
    graphName: this._graphName,
    writerId: this._writerId,
    lamport,
    versionVector: this._versionVector,
    getCurrentState: () => this._cachedState,
    expectedParentSha: parentSha,
    onDeleteWithData: this._onDeleteWithData,
    onCommitSuccess: (/** @type {{patch?: import('../types/WarpTypesV2.js').PatchV2, sha?: string}} */ opts) => this._onPatchCommitted(this._writerId, opts),
    codec: this._codec,
    logger: this._logger || undefined,
  });
}

/**
 * Convenience wrapper: creates a patch, runs the callback, and commits.
 *
 * The callback receives a `PatchBuilderV2` and may be synchronous or
 * asynchronous. The commit happens only after the callback resolves
 * successfully. If the callback throws or rejects, no commit is attempted
 * and the error propagates untouched.
 *
 * Not reentrant: calling `graph.patch()` inside a callback throws.
 * Use `createPatch()` directly for advanced multi-patch workflows.
 *
 * **Multi-writer note:** call `materialize()` before `patch()` so that
 * `_maxObservedLamport` is up-to-date. See `createPatch()` for details.
 *
 * @this {import('../WarpGraph.js').default}
 * @param {(p: PatchBuilderV2) => void | Promise<void>} build - Callback that adds operations to the patch
 * @returns {Promise<string>} The commit SHA of the new patch
 *
 * @example
 * const sha = await graph.patch(p => {
 *   p.addNode('user:alice');
 *   p.setProperty('user:alice', 'name', 'Alice');
 * });
 */
export async function patch(build) {
  if (this._patchInProgress) {
    throw new Error(
      'graph.patch() is not reentrant. Use createPatch() for nested or concurrent patches.',
    );
  }
  this._patchInProgress = true;
  try {
    const p = await this.createPatch();
    await build(p);
    return await p.commit();
  } finally {
    this._patchInProgress = false;
  }
}

/**
 * Gets the next lamport timestamp and current parent SHA for this writer.
 * Reads from the current ref chain to determine values.
 *
 * @this {import('../WarpGraph.js').default}
 * @returns {Promise<{lamport: number, parentSha: string|null}>} The next lamport and current parent
 */
export async function _nextLamport() {
  const writerRef = buildWriterRef(this._graphName, this._writerId);
  const currentRefSha = await this._persistence.readRef(writerRef);

  let ownTick = 0;

  if (currentRefSha) {
    // Read the current patch commit to get its lamport timestamp
    const commitMessage = await this._persistence.showNode(currentRefSha);
    const kind = detectMessageKind(commitMessage);

    if (kind === 'patch') {
      try {
        const patchInfo = decodePatchMessage(commitMessage);
        ownTick = patchInfo.lamport;
      } catch (err) {
        throw new Error(
          `Failed to parse lamport from writer ref ${writerRef}: ` +
          `commit ${currentRefSha} has invalid patch message format`,
          { cause: err }
        );
      }
    }
    // Non-patch ref: ownTick stays 0 (fresh start), falls through to standard return.
  }

  // Standard Lamport clock rule: next tick = max(own chain, globally observed max) + 1.
  // _maxObservedLamport is updated during materialize() and after each commit, so this
  // is O(1) — no additional git reads required at commit time.
  return {
    lamport: Math.max(ownTick, this._maxObservedLamport) + 1,
    parentSha: currentRefSha ?? null,
  };
}

/**
 * Loads all patches from a writer's ref chain.
 *
 * Walks commits from the tip SHA back to the first patch commit,
 * collecting all patches along the way.
 *
 * @this {import('../WarpGraph.js').default}
 * @param {string} writerId - The writer ID to load patches for
 * @param {string|null} [stopAtSha=null] - Stop walking when reaching this SHA (exclusive)
 * @returns {Promise<Array<{patch: import('../types/WarpTypesV2.js').PatchV2, sha: string}>>} Array of patches
 */
export async function _loadWriterPatches(writerId, stopAtSha = null) {
  const writerRef = buildWriterRef(this._graphName, writerId);
  const tipSha = await this._persistence.readRef(writerRef);

  if (!tipSha) {
    return [];
  }

  const patches = [];
  let currentSha = tipSha;

  while (currentSha && currentSha !== stopAtSha) {
    // Get commit info and message
    const nodeInfo = await this._persistence.getNodeInfo(currentSha);
    const {message} = nodeInfo;

    // Check if this is a patch commit
    const kind = detectMessageKind(message);
    if (kind !== 'patch') {
      // Not a patch commit, stop walking
      break;
    }

    // Decode the patch message to get patchOid
    const patchMeta = decodePatchMessage(message);

    // Read the patch blob
    const patchBuffer = await this._persistence.readBlob(patchMeta.patchOid);
    const decoded = /** @type {import('../types/WarpTypesV2.js').PatchV2} */ (this._codec.decode(patchBuffer));

    patches.push({ patch: decoded, sha: currentSha });

    // Move to parent commit
    if (nodeInfo.parents && nodeInfo.parents.length > 0) {
      currentSha = nodeInfo.parents[0];
    } else {
      break;
    }
  }

  // Patches are collected in reverse order (newest first), reverse them
  return patches.reverse();
}

/**
 * Returns patches from a writer's ref chain.
 *
 * @this {import('../WarpGraph.js').default}
 * @param {string} writerId - The writer ID to load patches for
 * @param {string|null} [stopAtSha=null] - Stop walking when reaching this SHA (exclusive)
 * @returns {Promise<Array<{patch: import('../types/WarpTypesV2.js').PatchV2, sha: string}>>} Array of patches
 */
export async function getWriterPatches(writerId, stopAtSha = null) {
  return await this._loadWriterPatches(writerId, stopAtSha);
}

/**
 * Post-commit hook: updates version vector, eager re-materialize,
 * provenance index, frontier, and audit service.
 *
 * @this {import('../WarpGraph.js').default}
 * @param {string} writerId - The writer that committed
 * @param {{patch?: import('../types/WarpTypesV2.js').PatchV2, sha?: string}} [opts]
 * @returns {Promise<void>}
 */
export async function _onPatchCommitted(writerId, { patch: committed, sha } = {}) {
  vvIncrement(this._versionVector, writerId);
  // Keep _maxObservedLamport up to date so _nextLamport() issues globally-monotonic ticks.
  if (committed?.lamport !== undefined && committed.lamport > this._maxObservedLamport) {
    this._maxObservedLamport = committed.lamport;
  }
  this._patchesSinceCheckpoint++;
  // Eager re-materialize: apply the just-committed patch to cached state
  // Only when the cache is clean — applying a patch to stale state would be incorrect
  if (this._cachedState && !this._stateDirty && committed && sha) {
    let tickReceipt = null;
    if (this._auditService) {
      const result = /** @type {{state: import('../services/JoinReducer.js').WarpStateV5, receipt: import('../types/TickReceipt.js').TickReceipt}} */ (
        joinPatch(this._cachedState, /** @type {Parameters<typeof joinPatch>[1]} */ (committed), sha, true)
      );
      tickReceipt = result.receipt;
    } else {
      joinPatch(this._cachedState, /** @type {Parameters<typeof joinPatch>[1]} */ (committed), sha);
    }
    await this._setMaterializedState(this._cachedState);
    // Update provenance index with new patch
    if (this._provenanceIndex) {
      this._provenanceIndex.addPatch(sha, /** @type {string[]|undefined} */ (committed.reads), /** @type {string[]|undefined} */ (committed.writes));
    }
    // Keep _lastFrontier in sync so hasFrontierChanged() won't misreport stale
    if (this._lastFrontier) {
      this._lastFrontier.set(writerId, sha);
    }
    // Audit receipt — AFTER all state updates succeed
    if (this._auditService && tickReceipt) {
      try {
        await this._auditService.commit(tickReceipt);
      } catch {
        // Data commit already succeeded. Logged inside service.
      }
    }
  } else {
    this._stateDirty = true;
    if (this._auditService) {
      this._auditSkipCount++;
      this._logger?.warn('[warp:audit]', {
        code: 'AUDIT_SKIPPED_DIRTY_STATE',
        sha,
        skipCount: this._auditSkipCount,
      });
    }
  }
}

/**
 * Creates a Writer bound to an existing (or resolved) writer ID.
 *
 * @this {import('../WarpGraph.js').default}
 * @param {string} writerId - The writer ID to resolve
 * @returns {Promise<Writer>} A Writer instance
 */
export async function writer(writerId) {
  // Build config adapters for resolveWriterId
  const configGet = async (/** @type {string} */ key) => await this._persistence.configGet(key);
  const configSet = async (/** @type {string} */ key, /** @type {string} */ value) => await this._persistence.configSet(key, value);

  // Resolve the writer ID
  const resolvedWriterId = await resolveWriterId({
    graphName: this._graphName,
    explicitWriterId: writerId,
    configGet,
    configSet,
  });

  /** @type {CorePersistence} */
  const persistence = this._persistence;
  return new Writer({
    persistence,
    graphName: this._graphName,
    writerId: resolvedWriterId,
    versionVector: this._versionVector,
    getCurrentState: /** @type {() => Promise<import('../services/JoinReducer.js').WarpStateV5>} */ (/** @type {unknown} */ (() => this._cachedState)),
    onDeleteWithData: this._onDeleteWithData,
    onCommitSuccess: /** @type {(result: {patch: Object, sha: string}) => void} */ (/** @type {unknown} */ ((/** @type {{patch?: import('../types/WarpTypesV2.js').PatchV2, sha?: string}} */ opts) => this._onPatchCommitted(resolvedWriterId, opts))),
    codec: this._codec,
  });
}

/**
 * Creates a new Writer with a fresh canonical ID.
 *
 * This always generates a new unique writer ID, regardless of any
 * existing configuration. Use this when you need a guaranteed fresh
 * identity (e.g., spawning a new writer process).
 *
 * @deprecated Use `writer()` to resolve a stable ID from git config, or `writer(id)` with an explicit ID.
 * @this {import('../WarpGraph.js').default}
 * @param {Object} [opts]
 * @param {'config'|'none'} [opts.persist='none'] - Whether to persist the new ID to git config
 * @param {string} [opts.alias] - Optional alias for config key (used with persist:'config')
 * @returns {Promise<Writer>} A Writer instance with new canonical ID
 * @throws {Error} If config operations fail (when persist:'config')
 *
 * @example
 * // Create ephemeral writer (not persisted)
 * const writer = await graph.createWriter();
 *
 * @example
 * // Create and persist to git config
 * const writer = await graph.createWriter({ persist: 'config' });
 */
export async function createWriter(opts = {}) {
  if (this._logger) {
    this._logger.warn('[warp] createWriter() is deprecated. Use writer() or writer(id) instead.');
  } else {
    // eslint-disable-next-line no-console
    console.warn('[warp] createWriter() is deprecated. Use writer() or writer(id) instead.');
  }

  const { persist = 'none', alias } = opts;

  // Generate new canonical writerId
  const freshWriterId = generateWriterId();

  // Optionally persist to git config
  if (persist === 'config') {
    const configKey = alias
      ? `warp.writerId.${alias}`
      : `warp.writerId.${this._graphName}`;
    await this._persistence.configSet(configKey, freshWriterId);
  }

  /** @type {CorePersistence} */
  const writerPersistence = this._persistence;
  return new Writer({
    persistence: writerPersistence,
    graphName: this._graphName,
    writerId: freshWriterId,
    versionVector: this._versionVector,
    getCurrentState: /** @type {() => Promise<import('../services/JoinReducer.js').WarpStateV5>} */ (/** @type {unknown} */ (() => this._cachedState)),
    onDeleteWithData: this._onDeleteWithData,
    onCommitSuccess: /** @type {(result: {patch: Object, sha: string}) => void} */ (/** @type {unknown} */ ((/** @type {{patch?: import('../types/WarpTypesV2.js').PatchV2, sha?: string}} */ commitOpts) => this._onPatchCommitted(freshWriterId, commitOpts))),
    codec: this._codec,
  });
}

/**
 * Ensures cached state is fresh. When autoMaterialize is enabled,
 * materializes if state is null or dirty. Otherwise throws.
 *
 * @this {import('../WarpGraph.js').default}
 * @returns {Promise<void>}
 * @throws {QueryError} If no cached state and autoMaterialize is off (code: `E_NO_STATE`)
 * @throws {QueryError} If cached state is dirty and autoMaterialize is off (code: `E_STALE_STATE`)
 */
export async function _ensureFreshState() {
  if (this._autoMaterialize && (!this._cachedState || this._stateDirty)) {
    await this.materialize();
    return;
  }
  if (!this._cachedState) {
    throw new QueryError(
      E_NO_STATE_MSG,
      { code: 'E_NO_STATE' },
    );
  }
  if (this._stateDirty) {
    throw new QueryError(
      E_STALE_STATE_MSG,
      { code: 'E_STALE_STATE' },
    );
  }
}

/**
 * Discovers all writers that have written to this graph.
 *
 * @this {import('../WarpGraph.js').default}
 * @returns {Promise<string[]>} Sorted array of writer IDs
 */
export async function discoverWriters() {
  const prefix = buildWritersPrefix(this._graphName);
  const refs = await this._persistence.listRefs(prefix);

  const writerIds = [];
  for (const refPath of refs) {
    const writerId = parseWriterIdFromRef(refPath);
    if (writerId) {
      writerIds.push(writerId);
    }
  }

  return writerIds.sort();
}

/**
 * Discovers all distinct Lamport ticks across all writers.
 *
 * Walks each writer's patch chain from tip to root, reading commit
 * messages (no CBOR blob deserialization) to extract Lamport timestamps.
 * Stops when a non-patch commit (e.g. checkpoint) is encountered.
 * Logs a warning for any non-monotonic lamport sequence within a single
 * writer's chain.
 *
 * @this {import('../WarpGraph.js').default}
 * @returns {Promise<{
 *   ticks: number[],
 *   maxTick: number,
 *   perWriter: Map<string, {ticks: number[], tipSha: string|null, tickShas: Record<number, string>}>
 * }>} `ticks` is the sorted (ascending) deduplicated union of all
 *   Lamport values; `maxTick` is the largest value (0 if none);
 *   `perWriter` maps each writer ID to its ticks in ascending order
 *   and its current tip SHA (or `null` if the writer ref is missing)
 * @throws {Error} If reading refs or commit metadata fails
 */
export async function discoverTicks() {
  const writerIds = await this.discoverWriters();
  /** @type {Set<number>} */
  const globalTickSet = new Set();
  const perWriter = new Map();

  for (const writerId of writerIds) {
    const writerRef = buildWriterRef(this._graphName, writerId);
    const tipSha = await this._persistence.readRef(writerRef);
    const writerTicks = [];
    /** @type {Record<number, string>} */
    const tickShas = {};

    if (tipSha) {
      let currentSha = tipSha;
      let lastLamport = Infinity;

      while (currentSha) {
        const nodeInfo = await this._persistence.getNodeInfo(currentSha);
        const kind = detectMessageKind(nodeInfo.message);
        if (kind !== 'patch') {
          break;
        }

        const patchMeta = decodePatchMessage(nodeInfo.message);
        globalTickSet.add(patchMeta.lamport);
        writerTicks.push(patchMeta.lamport);
        tickShas[patchMeta.lamport] = currentSha;

        // Check monotonic invariant (walking newest->oldest, lamport should decrease)
        if (patchMeta.lamport > lastLamport && this._logger) {
          this._logger.warn(`[warp] non-monotonic lamport for writer ${writerId}: ${patchMeta.lamport} > ${lastLamport}`);
        }
        lastLamport = patchMeta.lamport;

        if (nodeInfo.parents && nodeInfo.parents.length > 0) {
          currentSha = nodeInfo.parents[0];
        } else {
          break;
        }
      }
    }

    perWriter.set(writerId, {
      ticks: writerTicks.reverse(),
      tipSha: tipSha || null,
      tickShas,
    });
  }

  const ticks = [...globalTickSet].sort((a, b) => a - b);
  const maxTick = ticks.length > 0 ? ticks[ticks.length - 1] : 0;

  return { ticks, maxTick, perWriter };
}

/**
 * Joins an external WarpStateV5 into the cached state using CRDT merge.
 *
 * @this {import('../WarpGraph.js').default}
 * @param {import('../services/JoinReducer.js').WarpStateV5} otherState - The state to merge in
 * @returns {{state: import('../services/JoinReducer.js').WarpStateV5, receipt: Object}} Merged state and receipt
 * @throws {QueryError} If no cached state exists (code: `E_NO_STATE`)
 * @throws {Error} If otherState is invalid
 */
export function join(otherState) {
  if (!this._cachedState) {
    throw new QueryError(E_NO_STATE_MSG, {
      code: 'E_NO_STATE',
    });
  }

  if (!otherState || !otherState.nodeAlive || !otherState.edgeAlive) {
    throw new Error('Invalid state: must be a valid WarpStateV5 object');
  }

  // Capture pre-merge counts for receipt
  const beforeNodes = orsetElements(this._cachedState.nodeAlive).length;
  const beforeEdges = orsetElements(this._cachedState.edgeAlive).length;
  const beforeFrontierSize = this._cachedState.observedFrontier.size;

  // Perform the join
  const mergedState = joinStates(this._cachedState, otherState);

  // Calculate receipt
  const afterNodes = orsetElements(mergedState.nodeAlive).length;
  const afterEdges = orsetElements(mergedState.edgeAlive).length;
  const afterFrontierSize = mergedState.observedFrontier.size;

  // Count property changes (keys that existed in both but have different values)
  let propsChanged = 0;
  for (const [key, reg] of mergedState.prop) {
    const oldReg = this._cachedState.prop.get(key);
    if (!oldReg || oldReg.value !== reg.value) {
      propsChanged++;
    }
  }

  const receipt = {
    nodesAdded: Math.max(0, afterNodes - beforeNodes),
    nodesRemoved: Math.max(0, beforeNodes - afterNodes),
    edgesAdded: Math.max(0, afterEdges - beforeEdges),
    edgesRemoved: Math.max(0, beforeEdges - afterEdges),
    propsChanged,
    frontierMerged: afterFrontierSize !== beforeFrontierSize ||
      !this._frontierEquals(this._cachedState.observedFrontier, mergedState.observedFrontier),
  };

  // Update cached state
  this._cachedState = mergedState;

  return { state: mergedState, receipt };
}

/**
 * Compares two version vectors for equality.
 *
 * @this {import('../WarpGraph.js').default}
 * @param {import('../crdt/VersionVector.js').VersionVector} a
 * @param {import('../crdt/VersionVector.js').VersionVector} b
 * @returns {boolean}
 */
export function _frontierEquals(a, b) {
  if (a.size !== b.size) {
    return false;
  }
  for (const [key, val] of a) {
    if (b.get(key) !== val) {
      return false;
    }
  }
  return true;
}
