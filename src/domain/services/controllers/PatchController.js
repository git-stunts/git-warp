/**
 * PatchController — state mutation, writer lifecycle, discovery, and CRDT join.
 *
 * Extracted from patch.methods.js. WarpRuntime delegates to this controller
 * via defineProperty loops on the prototype.
 *
 * @module domain/services/controllers/PatchController
 */

import { PatchBuilderV2 } from '../PatchBuilderV2.js';
import { joinStates, applyWithDiff, applyWithReceipt } from '../JoinReducer.js';
import { orsetElements } from '../../crdt/ORSet.js';
import { buildWriterRef, buildWritersPrefix, parseWriterIdFromRef } from '../../utils/RefLayout.js';
import { decodePatchMessage, detectMessageKind } from '../codec/WarpMessageCodec.js';
import { Writer } from '../../warp/Writer.js';
import { resolveWriterId } from '../../utils/WriterId.js';
import EncryptionError from '../../errors/EncryptionError.js';
import PersistenceError from '../../errors/PersistenceError.js';
import { QueryError, E_NO_STATE_MSG, E_STALE_STATE_MSG } from '../../warp/_internal.js';

/**
 * @typedef {import('../../WarpRuntime.js').default} PatchHost
 * @typedef {import('../../types/WarpPersistence.js').CorePersistence} CorePersistence
 */

export default class PatchController {
  /** @type {PatchHost} */
  _host;

  /**
   * Creates a PatchController bound to a WarpRuntime host.
   * @param {PatchHost} host
   */
  constructor(host) {
    this._host = host;
  }

  /**
   * Creates a new PatchBuilderV2 for this graph.
   *
   * @returns {Promise<PatchBuilderV2>}
   */
  async createPatch() {
    const h = this._host;
    const { lamport, parentSha } = await this._nextLamport();
    return new PatchBuilderV2({
      persistence: h._persistence,
      graphName: h._graphName,
      writerId: h._writerId,
      lamport,
      versionVector: h._versionVector,
      getCurrentState: /** Returns the cached CRDT state. @returns {import('../JoinReducer.js').WarpStateV5|null} */ () => h._cachedState,
      expectedParentSha: parentSha,
      onDeleteWithData: h._onDeleteWithData,
      onCommitSuccess: /** Post-commit callback. @param {{patch?: import('../../types/WarpTypesV2.js').PatchV2, sha?: string}} opts */ (opts) => this._onPatchCommitted(h._writerId, opts),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- WarpRuntime options are untyped; cast narrows
      ...(h._patchJournal !== null && h._patchJournal !== undefined ? { patchJournal: /** @type {import('../../../ports/PatchJournalPort.js').default} */ (h._patchJournal) } : {}),
      ...(h._logger !== null && h._logger !== undefined ? { logger: h._logger } : {}),
      ...(h._blobStorage !== null && h._blobStorage !== undefined ? { blobStorage: h._blobStorage } : {}),
    });
  }

  /**
   * Convenience wrapper: creates a patch, runs the callback, and commits.
   *
   * @param {(p: PatchBuilderV2) => void | Promise<void>} build
   * @returns {Promise<string>}
   */
  async patch(build) {
    const h = this._host;
    if (h._patchInProgress) {
      throw new Error(
        'graph.patch() is not reentrant. Use createPatch() for nested or concurrent patches.',
      );
    }
    h._patchInProgress = true;
    try {
      const p = await this.createPatch();
      await build(p);
      return await p.commit();
    } finally {
      h._patchInProgress = false;
    }
  }

  /**
   * Applies multiple patches sequentially.
   *
   * @param {...((p: PatchBuilderV2) => void | Promise<void>)} builds
   * @returns {Promise<string[]>}
   */
  async patchMany(...builds) {
    if (builds.length === 0) {
      return [];
    }
    const shas = [];
    for (const build of builds) {
      shas.push(await this.patch(build));
    }
    return shas;
  }

  /**
   * Gets the next lamport timestamp and current parent SHA.
   *
   * @returns {Promise<{lamport: number, parentSha: string|null}>}
   */
  async _nextLamport() {
    const h = this._host;
    const writerRef = buildWriterRef(h._graphName, h._writerId);
    const currentRefSha = await h._persistence.readRef(writerRef);

    let ownTick = 0;

    if (typeof currentRefSha === 'string' && currentRefSha.length > 0) {
      const commitMessage = await h._persistence.showNode(currentRefSha);
      const kind = detectMessageKind(commitMessage);

      if (kind === 'patch') {
        try {
          const patchInfo = decodePatchMessage(commitMessage);
          ownTick = patchInfo.lamport;
        } catch (err) {
          throw new Error(
            `Failed to parse lamport from writer ref ${writerRef}: ` +
            `commit ${currentRefSha} has invalid patch message format`,
            { cause: err },
          );
        }
      }
    }

    return {
      lamport: Math.max(ownTick, h._maxObservedLamport) + 1,
      parentSha: currentRefSha ?? null,
    };
  }

  /**
   * Loads a patch chain starting from an explicit tip SHA.
   *
   * @param {string} tipSha
   * @param {string|null} [stopAtSha=null]
   * @returns {Promise<Array<{patch: import('../../types/WarpTypesV2.js').PatchV2, sha: string}>>}
   */
  async _loadPatchChainFromSha(tipSha, stopAtSha = null) {
    if (typeof tipSha !== 'string' || tipSha.length === 0) {
      return [];
    }

    const h = this._host;
    const patches = [];
    let currentSha = tipSha;

    while (currentSha && currentSha !== stopAtSha) {
      const nodeInfo = await h._persistence.getNodeInfo(currentSha);
      const { message } = nodeInfo;
      const kind = detectMessageKind(message);
      if (kind !== 'patch') {
        break;
      }

      const patchMeta = decodePatchMessage(message);
      /** @type {import('../../../ports/PatchJournalPort.js').default | null | undefined} */
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- WarpRuntime options are untyped; cast narrows
      const journal = /** @type {import('../../../ports/PatchJournalPort.js').default | null | undefined} */ (h._patchJournal);
      if (journal === null || journal === undefined) {
        // Legacy fallback: read the patch blob directly and decode with the codec
        const raw = await h._persistence.readBlob(patchMeta.patchOid);
        const decoded = /** @type {import('../../types/WarpTypesV2.js').PatchV2} */ (h._codec.decode(raw));
        patches.push({ patch: decoded, sha: currentSha });
        if (Array.isArray(nodeInfo.parents) && nodeInfo.parents.length > 0) {
          currentSha = nodeInfo.parents[0] ?? '';
        } else {
          break;
        }
        continue;
      }
      const decoded = /** @type {import('../../types/WarpTypesV2.js').PatchV2} */ (
        await journal.readPatch(patchMeta.patchOid, { encrypted: patchMeta.encrypted })
      );

      patches.push({ patch: decoded, sha: currentSha });

      if (Array.isArray(nodeInfo.parents) && nodeInfo.parents.length > 0) {
        currentSha = nodeInfo.parents[0] ?? '';
      } else {
        break;
      }
    }

    return patches.reverse();
  }

  /**
   * Loads all patches from a writer's ref chain.
   *
   * @param {string} writerId
   * @param {string|null} [stopAtSha=null]
   * @returns {Promise<Array<{patch: import('../../types/WarpTypesV2.js').PatchV2, sha: string}>>}
   */
  async _loadWriterPatches(writerId, stopAtSha = null) {
    const writerRef = buildWriterRef(this._host._graphName, writerId);
    const tipSha = await this._host._persistence.readRef(writerRef);

    if (typeof tipSha !== 'string' || tipSha.length === 0) {
      return [];
    }

    return await this._loadPatchChainFromSha(tipSha, stopAtSha);
  }

  /**
   * Returns patches from a writer's ref chain (public API).
   *
   * @param {string} writerId
   * @param {string|null} [stopAtSha=null]
   * @returns {Promise<Array<{patch: import('../../types/WarpTypesV2.js').PatchV2, sha: string}>>}
   */
  async getWriterPatches(writerId, stopAtSha = null) {
    return await this._loadWriterPatches(writerId, stopAtSha);
  }

  /**
   * Post-commit hook: updates version vector, eager re-materialize,
   * provenance index, frontier, and audit service.
   *
   * @param {string} writerId
   * @param {{patch?: import('../../types/WarpTypesV2.js').PatchV2, sha?: string}} [opts]
   * @returns {Promise<void>}
   */
  async _onPatchCommitted(writerId, { patch: committed, sha } = {}) {
    const h = this._host;
    h._versionVector.increment(writerId);
    if (committed?.lamport !== undefined && committed.lamport > h._maxObservedLamport) {
      h._maxObservedLamport = committed.lamport;
    }
    h._patchesSinceCheckpoint++;
    if (h._cachedState && !h._stateDirty && committed && typeof sha === 'string' && sha.length > 0) {
      let tickReceipt = null;
      /** @type {import('../../types/PatchDiff.js').PatchDiff|null} */
      let diff = null;
      if (h._auditService) {
        const result = applyWithReceipt(h._cachedState, committed, sha);
        tickReceipt = result.receipt;
      } else {
        const result = applyWithDiff(h._cachedState, committed, sha);
        diff = result.diff;
      }
      await h._setMaterializedState(h._cachedState, { diff });
      if (h._provenanceIndex) {
        h._provenanceIndex.addPatch(sha, /** @type {string[]|undefined} */ (committed.reads), /** @type {string[]|undefined} */ (committed.writes));
      }
      if (h._lastFrontier) {
        h._lastFrontier.set(writerId, sha);
      }
      if (h._auditService && tickReceipt) {
        try {
          await h._auditService.commit(tickReceipt);
        } catch {
          // Data commit already succeeded. Logged inside service.
        }
      }
    } else {
      h._stateDirty = true;
      h._cachedViewHash = null;
      if (h._auditService) {
        h._auditSkipCount++;
        h._logger?.warn('[warp:audit]', {
          code: 'AUDIT_SKIPPED_DIRTY_STATE',
          sha,
          skipCount: h._auditSkipCount,
        });
      }
    }
  }

  /**
   * Creates a Writer bound to an existing (or resolved) writer ID.
   *
   * @param {string} writerId
   * @returns {Promise<Writer>}
   */
  async writer(writerId) {
    const h = this._host;
    /** @type {import('../../../ports/ConfigPort.js').default} */
    const config = /** @type {import('../../../ports/ConfigPort.js').default} */ (/** @type {unknown} */ (h._persistence));
    const configGet = /** Reads a git config key. @param {string} key @returns {Promise<string|null>} */ async (key) => await config.configGet(key);
    const configSet = /** Writes a git config key. @param {string} key @param {string} value @returns {Promise<void>} */ async (key, value) => await config.configSet(key, value);

    const resolvedWriterId = await resolveWriterId({
      graphName: h._graphName,
      explicitWriterId: writerId,
      configGet,
      configSet,
    });

    /** @type {CorePersistence} */
    const persistence = h._persistence;
    return new Writer({
      persistence,
      graphName: h._graphName,
      writerId: resolvedWriterId,
      versionVector: h._versionVector,
      getCurrentState: /** Returns the cached CRDT state. @returns {import('../JoinReducer.js').WarpStateV5|null} */ () => h._cachedState,
      onDeleteWithData: h._onDeleteWithData,
      onCommitSuccess: /** Post-commit callback. @type {(result: {patch: import('../../types/WarpTypesV2.js').PatchV2, sha: string}) => void} */ ((opts) => this._onPatchCommitted(resolvedWriterId, opts)),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- WarpRuntime options are untyped; cast narrows
      ...(h._patchJournal !== null && h._patchJournal !== undefined ? { patchJournal: /** @type {import('../../../ports/PatchJournalPort.js').default} */ (h._patchJournal) } : {}),
      ...(h._logger !== null && h._logger !== undefined ? { logger: h._logger } : {}),
      ...(h._blobStorage !== null && h._blobStorage !== undefined ? { blobStorage: h._blobStorage } : {}),
    });
  }

  /**
   * Ensures cached state is fresh.
   *
   * @returns {Promise<void>}
   */
  async _ensureFreshState() {
    const h = this._host;
    if (h._autoMaterialize && (!h._cachedState || h._stateDirty)) {
      await h.materialize();
      return;
    }
    if (!h._cachedState) {
      throw new QueryError(E_NO_STATE_MSG, { code: 'E_NO_STATE' });
    }
    if (h._stateDirty) {
      throw new QueryError(E_STALE_STATE_MSG, { code: 'E_STALE_STATE' });
    }
  }

  /**
   * Reads a patch blob, using patchBlobStorage for encrypted patches.
   *
   * @param {{ patchOid: string, encrypted: boolean }} patchMeta
   * @returns {Promise<Uint8Array>}
   */
  async _readPatchBlob(patchMeta) {
    const h = this._host;
    if (patchMeta.encrypted) {
      if (!h._patchBlobStorage) {
        throw new EncryptionError(
          'This graph contains encrypted patches; provide patchBlobStorage with an encryption key',
        );
      }
      return await h._patchBlobStorage.retrieve(patchMeta.patchOid);
    }
    const blob = await h._persistence.readBlob(patchMeta.patchOid);
    if (blob === null || blob === undefined) {
      throw new PersistenceError(
        `Patch blob not found: ${patchMeta.patchOid}`,
        PersistenceError.E_MISSING_OBJECT,
        { context: { oid: patchMeta.patchOid } },
      );
    }
    return blob;
  }

  /**
   * Discovers all writers that have written to this graph.
   *
   * @returns {Promise<string[]>}
   */
  async discoverWriters() {
    const prefix = buildWritersPrefix(this._host._graphName);
    const refs = await this._host._persistence.listRefs(prefix);

    const writerIds = [];
    for (const refPath of refs) {
      const writerId = parseWriterIdFromRef(refPath);
      if (typeof writerId === 'string' && writerId.length > 0) {
        writerIds.push(writerId);
      }
    }

    return writerIds.sort();
  }

  /**
   * Discovers all distinct Lamport ticks across all writers.
   *
   * @returns {Promise<{
   *   ticks: number[],
   *   maxTick: number,
   *   perWriter: Map<string, {ticks: number[], tipSha: string|null, tickShas: Record<number, string>}>
   * }>}
   */
  async discoverTicks() {
    const h = this._host;
    const writerIds = await this.discoverWriters();
    /** @type {Set<number>} */
    const globalTickSet = new Set();
    /** @type {Map<string, {ticks: number[], tipSha: string|null, tickShas: Record<number, string>}>} */
    const perWriter = new Map();

    for (const writerId of writerIds) {
      const writerRef = buildWriterRef(h._graphName, writerId);
      const tipSha = await h._persistence.readRef(writerRef);
      const writerTicks = [];
      /** @type {Record<number, string>} */
      const tickShas = {};

      if (typeof tipSha === 'string' && tipSha.length > 0) {
        let currentSha = tipSha;
        let lastLamport = Infinity;

        while (currentSha) {
          const nodeInfo = await h._persistence.getNodeInfo(currentSha);
          const kind = detectMessageKind(nodeInfo.message);
          if (kind !== 'patch') {
            break;
          }

          const patchMeta = decodePatchMessage(nodeInfo.message);
          globalTickSet.add(patchMeta.lamport);
          writerTicks.push(patchMeta.lamport);
          tickShas[patchMeta.lamport] = currentSha;

          if (patchMeta.lamport > lastLamport && h._logger) {
            h._logger.warn(`[warp] non-monotonic lamport for writer ${writerId}: ${patchMeta.lamport} > ${lastLamport}`);
          }
          lastLamport = patchMeta.lamport;

          if (Array.isArray(nodeInfo.parents) && nodeInfo.parents.length > 0) {
            currentSha = nodeInfo.parents[0] ?? '';
          } else {
            break;
          }
        }
      }

      perWriter.set(writerId, {
        ticks: writerTicks.reverse(),
        tipSha: typeof tipSha === 'string' && tipSha.length > 0 ? tipSha : null,
        tickShas,
      });
    }

    const ticks = [...globalTickSet].sort((a, b) => a - b);
    const maxTick = ticks.length > 0 ? (ticks[ticks.length - 1] ?? 0) : 0;

    return { ticks, maxTick, perWriter };
  }

  /**
   * Joins an external WarpStateV5 into the cached state using CRDT merge.
   *
   * @param {import('../JoinReducer.js').WarpStateV5} otherState
   * @returns {{state: import('../JoinReducer.js').WarpStateV5, receipt: {nodesAdded: number, nodesRemoved: number, edgesAdded: number, edgesRemoved: number, propsChanged: number, frontierMerged: boolean}}}
   */
  join(otherState) {
    const h = this._host;
    if (!h._cachedState) {
      throw new QueryError(E_NO_STATE_MSG, { code: 'E_NO_STATE' });
    }

    if (otherState === null || otherState === undefined || !('nodeAlive' in otherState) || !('edgeAlive' in otherState)) {
      throw new Error('Invalid state: must be a valid WarpStateV5 object');
    }

    const beforeNodes = orsetElements(h._cachedState.nodeAlive).length;
    const beforeEdges = orsetElements(h._cachedState.edgeAlive).length;
    const beforeFrontierSize = h._cachedState.observedFrontier.size;

    const mergedState = joinStates(h._cachedState, otherState);

    const afterNodes = orsetElements(mergedState.nodeAlive).length;
    const afterEdges = orsetElements(mergedState.edgeAlive).length;
    const afterFrontierSize = mergedState.observedFrontier.size;

    let propsChanged = 0;
    for (const [key, reg] of mergedState.prop) {
      const oldReg = h._cachedState.prop.get(key);
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
        !this._frontierEquals(h._cachedState.observedFrontier, mergedState.observedFrontier),
    };

    h._cachedState = mergedState;
    h._versionVector = mergedState.observedFrontier.clone();

    const adjacency = h._buildAdjacency(mergedState);
    h._materializedGraph = { state: mergedState, stateHash: null, adjacency };

    h._logicalIndex = null;
    h._propertyReader = null;
    h._cachedViewHash = null;
    h._cachedIndexTree = null;
    h._stateDirty = false;

    return { state: mergedState, receipt };
  }

  /**
   * Compares two version vectors for equality.
   *
   * @param {import('../../crdt/VersionVector.js').default} a
   * @param {import('../../crdt/VersionVector.js').default} b
   * @returns {boolean}
   */
  _frontierEquals(a, b) {
    return a.equals(b);
  }
}
