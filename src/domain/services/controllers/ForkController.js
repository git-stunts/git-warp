/**
 * ForkController — fork creation, wormhole compression, and
 * backfill-rejection helpers.
 *
 * Extracted from fork.methods.js.
 *
 * @module domain/services/ForkController
 */

import ForkError from '../../errors/ForkError.js';
import { CHECKPOINT_SCHEMA_STANDARD, CHECKPOINT_SCHEMA_V5_INTERMEDIATE } from '../state/CheckpointService.js';
import { validateGraphName, validateWriterId, buildWriterRef, buildWritersPrefix } from '../../utils/RefLayout.js';
import { generateWriterId } from '../../utils/WriterId.js';
import { createWormhole as createWormholeImpl } from '../WormholeService.js';


/** @import { default as ForkHost } from '../../WarpRuntime.js' */
const DEFAULT_ADJACENCY_CACHE_SIZE = 3;

/**
 * The host interface that ForkController depends on.
 *

 */

export default class ForkController {
  /** @type {ForkHost} */
  _host;

  /**
   * Creates a ForkController bound to a WarpRuntime host.
   * @param {ForkHost} host
   */
  constructor(host) {
    this._host = host;
  }

  /**
   * Creates a fork of this graph at a specific point in a writer's history.
   *
   * @param {{ from: string, at: string, forkName?: string, forkWriterId?: string }} options
   * @returns {Promise<import('../../WarpRuntime.js').default>}
   */
  async fork({ from, at, forkName, forkWriterId }) {
    const host = this._host;
    const t0 = host._clock.now();

    try {
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

      const writers = await host.discoverWriters();
      if (!writers.includes(from)) {
        throw new ForkError(`Writer '${from}' does not exist in graph '${host._graphName}'`, {
          code: 'E_FORK_WRITER_NOT_FOUND',
          context: { writerId: from, graphName: host._graphName, existingWriters: writers },
        });
      }

      const nodeExists = await host._persistence.nodeExists(at);
      if (!nodeExists) {
        throw new ForkError(`Patch SHA '${at}' does not exist`, {
          code: 'E_FORK_PATCH_NOT_FOUND',
          context: { patchSha: at, writerId: from },
        });
      }

      const writerRef = buildWriterRef(host._graphName, from);
      const tipSha = await host._persistence.readRef(writerRef);

      if (tipSha === null || tipSha === undefined || tipSha === '') {
        throw new ForkError(`Writer '${from}' has no commits`, {
          code: 'E_FORK_WRITER_NOT_FOUND',
          context: { writerId: from },
        });
      }

      const isInChain = await this._isAncestor(at, tipSha);
      if (!isInChain) {
        throw new ForkError(`Patch SHA '${at}' is not in writer '${from}' chain`, {
          code: 'E_FORK_PATCH_NOT_IN_CHAIN',
          context: { patchSha: at, writerId: from, tipSha },
        });
      }

      const resolvedForkName =
        forkName ?? `${host._graphName}-fork-${Math.random().toString(36).slice(2, 10).padEnd(8, '0')}`;
      try {
        validateGraphName(resolvedForkName);
      } catch (err) {
        throw new ForkError(`Invalid fork name: ${/** @type {Error} */ (err).message}`, {
          code: 'E_FORK_NAME_INVALID',
          context: { forkName: resolvedForkName, originalError: /** @type {Error} */ (err).message },
        });
      }

      const forkWritersPrefix = buildWritersPrefix(resolvedForkName);
      const existingForkRefs = await host._persistence.listRefs(forkWritersPrefix);
      if (existingForkRefs.length > 0) {
        throw new ForkError(`Graph '${resolvedForkName}' already exists`, {
          code: 'E_FORK_ALREADY_EXISTS',
          context: { forkName: resolvedForkName, existingRefs: existingForkRefs },
        });
      }

      const resolvedForkWriterId = (forkWriterId !== undefined && forkWriterId !== null && forkWriterId !== '') ? forkWriterId : generateWriterId();
      try {
        validateWriterId(resolvedForkWriterId);
      } catch (err) {
        throw new ForkError(`Invalid fork writer ID: ${/** @type {Error} */ (err).message}`, {
          code: 'E_FORK_WRITER_ID_INVALID',
          context: { forkWriterId: resolvedForkWriterId, originalError: /** @type {Error} */ (err).message },
        });
      }

      const forkWriterRef = buildWriterRef(resolvedForkName, resolvedForkWriterId);
      await host._persistence.updateRef(forkWriterRef, at);

      // Dynamic import to avoid circular dependency
      const { default: WarpRuntime } = await import('../../WarpRuntime.js');

      /** @type {import('../../WarpRuntime.js').default} */
      let forkGraph;
      try {
        forkGraph = await WarpRuntime.open({
          persistence: host._persistence,
          graphName: resolvedForkName,
          writerId: resolvedForkWriterId,
          gcPolicy: host._gcPolicy,
          adjacencyCacheSize: host._adjacencyCache?.maxSize ?? DEFAULT_ADJACENCY_CACHE_SIZE,
          ...(host._checkpointPolicy ? { checkpointPolicy: host._checkpointPolicy } : {}),
          autoMaterialize: host._autoMaterialize,
          onDeleteWithData: host._onDeleteWithData,
          ...(host._logger ? { logger: host._logger } : {}),
          clock: host._clock,
          crypto: host._crypto,
          codec: host._codec,
        });
      } catch (openErr) {
        // Rollback: delete the ref we just created to avoid a dangling fork
        try {
          await host._persistence.deleteRef(forkWriterRef);
        } catch {
          // Best-effort rollback — log but don't mask the original error
        }
        throw openErr;
      }

      host._logTiming('fork', t0, {
        metrics: `from=${from} at=${at.slice(0, 7)} name=${resolvedForkName}`,
      });

      return forkGraph;
    } catch (err) {
      host._logTiming('fork', t0, { error: /** @type {Error} */ (err) });
      throw err;
    }
  }

  /**
   * Creates a wormhole compressing a range of patches.
   *
   * @param {string} fromSha
   * @param {string} toSha
   * @returns {Promise<{fromSha: string, toSha: string, writerId: string, payload: import('../provenance/ProvenancePayload.js').default, patchCount: number}>}
   */
  async createWormhole(fromSha, toSha) {
    const host = this._host;
    const t0 = host._clock.now();

    try {
      const wormhole = await createWormholeImpl({
        persistence: host._persistence,
        graphName: host._graphName,
        fromSha,
        toSha,
        codec: host._codec,
      });

      host._logTiming('createWormhole', t0, {
        metrics: `${wormhole.patchCount} patches from=${fromSha.slice(0, 7)} to=${toSha.slice(0, 7)}`,
      });

      return wormhole;
    } catch (err) {
      host._logTiming('createWormhole', t0, { error: /** @type {Error} */ (err) });
      throw err;
    }
  }

  /**
   * Checks if ancestorSha is an ancestor of descendantSha.
   *
   * @param {string} ancestorSha
   * @param {string} descendantSha
   * @returns {Promise<boolean>}
   */
  async _isAncestor(ancestorSha, descendantSha) {
    if (!ancestorSha || !descendantSha) {
      return false;
    }
    if (ancestorSha === descendantSha) {
      return true;
    }

    /** @type {string | null} */
    let cur = descendantSha;
    /** @type {Set<string>} */
    const visited = new Set();
    while (cur !== null) {
      if (visited.has(cur)) {
        throw new ForkError('Cycle detected in commit graph', {
          code: 'E_FORK_CYCLE_DETECTED',
          context: { sha: cur },
        });
      }
      visited.add(cur);
      const nodeInfo = await this._host._persistence.getNodeInfo(cur);
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
   * @param {string} ckHead
   * @param {string} incomingSha
   * @returns {Promise<'same' | 'ahead' | 'behind' | 'diverged'>}
   */
  async _relationToCheckpointHead(ckHead, incomingSha) {
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
   *
   * @param {string} writerId
   * @param {string} incomingSha
   * @param {{state: import('../JoinReducer.js').WarpStateV5, frontier: Map<string, string>, stateHash: string, schema: number}} checkpoint
   * @returns {Promise<void>}
   */
  async _validatePatchAgainstCheckpoint(writerId, incomingSha, checkpoint) {
    if (checkpoint === null || checkpoint === undefined || (checkpoint.schema !== CHECKPOINT_SCHEMA_STANDARD && checkpoint.schema !== CHECKPOINT_SCHEMA_V5_INTERMEDIATE)) {
      return;
    }

    const ckHead = checkpoint.frontier?.get(writerId);
    if (ckHead === undefined || ckHead === null || ckHead === '') {
      return;
    }

    const relation = await this._relationToCheckpointHead(ckHead, incomingSha);

    if (relation === 'same' || relation === 'behind') {
      throw new ForkError(
        `Backfill rejected for writer ${writerId}: incoming patch is ${relation} checkpoint frontier`,
        { code: 'E_FORK_BACKFILL_REJECTED', context: { writerId, incomingSha, relation, ckHead } },
      );
    }

    if (relation === 'diverged') {
      throw new ForkError(
        `Writer fork detected for ${writerId}: incoming patch does not extend checkpoint head`,
        { code: 'E_FORK_WRITER_DIVERGED', context: { writerId, incomingSha, ckHead } },
      );
    }
  }
}
