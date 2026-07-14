/**
 * ForkController — fork creation, wormhole compression, and
 * backfill-rejection helpers.
 *
 * Extracted from fork.methods.js.
 *
 * @module domain/services/controllers/ForkController
 */

import ForkError from '../../errors/ForkError.ts';
import { isCurrentCheckpointSchema } from '../state/checkpointHelpers.ts';
import { validateGraphName, validateWriterId, buildWriterRef, buildWritersPrefix } from '../../utils/RefLayout.ts';
import { generateWriterId } from '../../utils/WriterId.ts';
import { createWormhole as createWormholeImpl } from '../WormholeService.ts';
import {
  openRuntimeHostProduct,
  type RuntimeHostOpenOptions,
  type RuntimeHostProduct,
} from '../../warp/RuntimeHostProduct.ts';
import type ProvenancePayload from '../provenance/ProvenancePayload.ts';
import type { LoadedCheckpoint } from '../state/checkpointLoad.ts';
import type CommitMessageCodecPort from '../../../ports/CommitMessageCodecPort.ts';
import type CodecPort from '../../../ports/CodecPort.ts';
import type CryptoPort from '../../../ports/CryptoPort.ts';
import type LoggerPort from '../../../ports/LoggerPort.ts';
import type BlobStoragePort from '../../../ports/BlobStoragePort.ts';
import type GCPolicy from '../GCPolicy.ts';
import type RuntimeStorageProviderPort from '../../../ports/RuntimeStorageProviderPort.ts';

const HEX_CHARS = '0123456789abcdef';
type ForkRuntimeOpenOptions = RuntimeHostOpenOptions;
type ForkedGraph = RuntimeHostProduct;
type ForkPersistence = ForkRuntimeOpenOptions['persistence'];

/** Generates an 8-char hex suffix using crypto-grade randomness. */
function randomSuffix(): string {
  const bytes = new Uint8Array(4);
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) {
    out += HEX_CHARS.charAt(b >>> 4) + HEX_CHARS.charAt(b & 0x0f);
  }
  return out;
}

type ForkHost = {
  _persistence: ForkPersistence;
  _runtimeStorage: RuntimeStorageProviderPort;
  _graphName: string;
  _gcPolicy: GCPolicy;
  _checkpointPolicy: { every: number } | null;
  _autoMaterialize: boolean;
  _onDeleteWithData: 'reject' | 'cascade' | 'warn';
  _logger: LoggerPort | null;
  _crypto: CryptoPort;
  _codec: CodecPort;
  _blobStorage: BlobStoragePort | null;
  _patchBlobStorage: BlobStoragePort | null;
  _commitMessageCodec: CommitMessageCodecPort;
  discoverWriters(): Promise<string[]>;
};

export default class ForkController {
  _host: ForkHost;

  constructor(host: ForkHost) {
    this._host = host;
  }

  async fork({ from, at, forkName, forkWriterId }: { from: string; at: string; forkName?: string; forkWriterId?: string }): Promise<ForkedGraph> {
    const host = this._host;

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
      forkName ?? `${host._graphName}-fork-${randomSuffix()}`;
    try {
      validateGraphName(resolvedForkName);
    } catch (err) {
      throw new ForkError(`Invalid fork name: ${(err as Error).message}`, {
        code: 'E_FORK_NAME_INVALID',
        context: { forkName: resolvedForkName, originalError: (err as Error).message },
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
      throw new ForkError(`Invalid fork writer ID: ${(err as Error).message}`, {
        code: 'E_FORK_WRITER_ID_INVALID',
        context: { forkWriterId: resolvedForkWriterId, originalError: (err as Error).message },
      });
    }

    const forkWriterRef = buildWriterRef(resolvedForkName, resolvedForkWriterId);
    await host._persistence.updateRef(forkWriterRef, at);

    let forkGraph: ForkedGraph;
    try {
      forkGraph = await openRuntimeHostProduct({
        persistence: host._persistence,
        runtimeStorage: host._runtimeStorage,
        graphName: resolvedForkName,
        writerId: resolvedForkWriterId,
        gcPolicy: host._gcPolicy,
        ...(host._checkpointPolicy ? { checkpointPolicy: host._checkpointPolicy } : {}),
        autoMaterialize: host._autoMaterialize,
        onDeleteWithData: host._onDeleteWithData,
        ...(host._logger ? { logger: host._logger } : {}),
        crypto: host._crypto,
        codec: host._codec,
      });
    } catch (openErr) {
      try {
        await host._persistence.deleteRef(forkWriterRef);
      } catch {
        // Best-effort rollback
      }
      throw openErr;
    }

    return forkGraph;
  }

  async createWormhole(fromSha: string, toSha: string): Promise<{ fromSha: string; toSha: string; writerId: string; payload: ProvenancePayload; patchCount: number }> {
    const host = this._host;
    return await createWormholeImpl({
      persistence: host._persistence,
      graphName: host._graphName,
      fromSha,
      toSha,
      commitMessageCodec: host._commitMessageCodec,
      codec: host._codec,
      ...(host._blobStorage ? { blobStorage: host._blobStorage } : {}),
      ...(host._patchBlobStorage ? { patchBlobStorage: host._patchBlobStorage } : {}),
    });
  }

  async _isAncestor(ancestorSha: string, descendantSha: string): Promise<boolean> {
    if (!ancestorSha || !descendantSha) { return false; }
    if (ancestorSha === descendantSha) { return true; }

    let cur: string | null = descendantSha;
    const visited = new Set<string>();
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
      if (parent === ancestorSha) { return true; }
      cur = parent;
    }
    return false;
  }

  async _relationToCheckpointHead(ckHead: string, incomingSha: string): Promise<'same' | 'ahead' | 'behind' | 'diverged'> {
    if (incomingSha === ckHead) { return 'same'; }
    if (await this._isAncestor(ckHead, incomingSha)) { return 'ahead'; }
    if (await this._isAncestor(incomingSha, ckHead)) { return 'behind'; }
    return 'diverged';
  }

  async _validatePatchAgainstCheckpoint(writerId: string, incomingSha: string, checkpoint: CheckpointFrontier | null | undefined): Promise<void> {
    if (checkpoint === null || checkpoint === undefined || !isCurrentCheckpointSchema(checkpoint.schema)) {
      return;
    }

    const ckHead = checkpoint.frontier?.get(writerId);
    if (ckHead === undefined || ckHead === null || ckHead === '') { return; }

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
type CheckpointFrontier = Pick<LoadedCheckpoint, 'schema' | 'frontier'>;
