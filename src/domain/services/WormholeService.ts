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

import defaultCodec from '../utils/defaultCodec.ts';
import ProvenancePayload from './provenance/ProvenancePayload.ts';
import WormholeError from '../errors/WormholeError.ts';
import EncryptionError from '../errors/EncryptionError.ts';
import PersistenceError from '../errors/PersistenceError.ts';
import { DEFAULT_COMMIT_MESSAGE_CODEC } from './codec/WarpMessageCodec.ts';
import type CommitPort from '../../ports/CommitPort.ts';
import type BlobPort from '../../ports/BlobPort.ts';
import type CodecPort from '../../ports/CodecPort.ts';
import type BlobStoragePort from '../../ports/BlobStoragePort.ts';
import type CommitMessageCodecPort from '../../ports/CommitMessageCodecPort.ts';
import type Patch from '../types/Patch.ts';
import type WarpState from './state/WarpState.ts';

type PersistencePort = CommitPort & BlobPort;

/**
 * Represents a compressed range of patches (wormhole).
 *
 * A WormholeEdge contains:
 * - The SHA of the first (oldest) patch in the range (fromSha)
 * - The SHA of the last (newest) patch in the range (toSha)
 * - The writer ID who created all patches in the range
 * - A ProvenancePayload containing all patches for replay
 */
export interface WormholeEdge {
  /** SHA of the first (oldest) patch commit */
  fromSha: string;
  /** SHA of the last (newest) patch commit */
  toSha: string;
  /** Writer ID of all patches in the range */
  writerId: string;
  /** Sub-payload for replay */
  payload: InstanceType<typeof ProvenancePayload>;
  /** Number of patches compressed */
  patchCount: number;
}

interface PatchEntry {
  patch: Patch;
  sha: string;
  writerId: string;
  parentSha: string | null;
}

/**
 * Validates that a SHA parameter is a non-empty string.
 * @throws {WormholeError} If SHA is invalid
 */
function validateSha(sha: unknown, paramName: string): void { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  if (sha === null || sha === undefined || typeof sha !== 'string') {
    throw new WormholeError(`${paramName} is required and must be a string`, {
      code: 'E_WORMHOLE_SHA_NOT_FOUND',
      context: { [paramName]: sha },
    });
  }
}

/**
 * Verifies that a SHA exists in the repository.
 * @throws {WormholeError} If SHA doesn't exist
 */
async function verifyShaExists(
  persistence: PersistencePort,
  sha: string,
  paramName: string,
): Promise<void> {
  const exists = await persistence.nodeExists(sha);
  if (!exists) {
    throw new WormholeError(`Patch SHA '${sha}' does not exist`, {
      code: 'E_WORMHOLE_SHA_NOT_FOUND',
      context: { sha, which: paramName },
    });
  }
}

interface ProcessCommitOptions {
  persistence: PersistencePort;
  sha: string;
  graphName: string;
  expectedWriter: string | null;
  commitMessageCodec?: CommitMessageCodecPort;
  codec?: CodecPort;
  blobStorage?: BlobStoragePort;
  patchBlobStorage?: BlobStoragePort;
}

/**
 * Processes a single commit in the wormhole chain.
 * @throws {WormholeError} On validation errors
 * @throws {EncryptionError} If the patch is encrypted but no patchBlobStorage is provided
 */
async function processCommit({
  persistence,
  sha,
  graphName,
  expectedWriter,
  commitMessageCodec,
  codec: codecOpt,
  blobStorage,
  patchBlobStorage,
}: ProcessCommitOptions): Promise<PatchEntry> {
  const codec = codecOpt ?? defaultCodec;
  const messageCodec = commitMessageCodec ?? DEFAULT_COMMIT_MESSAGE_CODEC;
  const nodeInfo = await persistence.getNodeInfo(sha);
  const { message, parents } = nodeInfo;

  const kind = messageCodec.detectKind(message);
  if (kind !== 'patch') {
    const kindLabel = kind ?? 'none';
    throw new WormholeError(`Commit '${sha}' is not a patch commit (kind: ${kindLabel})`, {
      code: 'E_WORMHOLE_NOT_PATCH',
      context: { sha, kind },
    });
  }

  const patchMeta = messageCodec.decodePatch(message);

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

  let patchBuffer: Uint8Array;
  if (patchMeta.storage.strategy === 'git-cas') {
    if (!blobStorage) {
      throw new EncryptionError(
        'This graph contains git-cas patches; provide blobStorage for CAS restore',
      );
    }
    patchBuffer = await blobStorage.retrieve(patchMeta.patchOid);
  } else if (patchMeta.storage.strategy === 'legacy-external-storage') {
    if (!patchBlobStorage) {
      throw new EncryptionError(
        'This graph contains encrypted patches in legacy external storage; provide patchBlobStorage with an encryption key',
      );
    }
    patchBuffer = await patchBlobStorage.retrieve(patchMeta.patchOid);
  } else {
    patchBuffer = await persistence.readBlob(patchMeta.patchOid);
  }
  if (patchBuffer === null || patchBuffer === undefined) {
    throw new PersistenceError(
      `Patch blob not found: ${patchMeta.patchOid}`,
      PersistenceError.E_MISSING_OBJECT,
      { context: { oid: patchMeta.patchOid } },
    );
  }
  const patch = codec.decode<Patch>(patchBuffer);

  return {
    patch,
    sha,
    writerId: patchMeta.writer,
    parentSha: parents !== null && parents !== undefined && parents.length > 0 ? (parents[0] ?? null) : null,
  };
}

interface CollectPatchRangeOptions {
  persistence: PersistencePort;
  graphName: string;
  fromSha: string;
  toSha: string;
  commitMessageCodec?: CommitMessageCodecPort;
  codec?: CodecPort;
  blobStorage?: BlobStoragePort;
  patchBlobStorage?: BlobStoragePort;
}

/**
 * Collects patches from toSha back to fromSha (newest-first order).
 *
 * Walks the parent chain from toSha towards fromSha, collecting and
 * validating each commit along the way.
 *
 * @returns Patches in newest-first order
 * @throws {WormholeError} If fromSha is not an ancestor of toSha or range is empty
 */
async function collectPatchRange({
  persistence,
  graphName,
  fromSha,
  toSha,
  commitMessageCodec,
  codec,
  blobStorage,
  patchBlobStorage,
}: CollectPatchRangeOptions): Promise<Array<{ patch: Patch; sha: string; writerId: string }>> {
  const patches: Array<{ patch: Patch; sha: string; writerId: string }> = [];
  let currentSha: string | null = toSha;
  let writerId: string | null = null;

  while (currentSha !== null && currentSha !== undefined) {
    const result = await processCommit({
      persistence,
      sha: currentSha,
      graphName,
      expectedWriter: writerId,
      ...(commitMessageCodec !== undefined ? { commitMessageCodec } : {}),
      ...(codec !== undefined ? { codec } : {}),
      ...(blobStorage !== undefined ? { blobStorage } : {}),
      ...(patchBlobStorage !== undefined ? { patchBlobStorage } : {}),
    });
    writerId = result.writerId;
    patches.push({ patch: result.patch, sha: result.sha, writerId: result.writerId });

    if (currentSha === fromSha) {
      break;
    }

    if (result.parentSha === null || result.parentSha === undefined) {
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

interface CreateWormholeOptions {
  persistence: PersistencePort;
  graphName: string;
  fromSha: string;
  toSha: string;
  commitMessageCodec?: CommitMessageCodecPort;
  codec?: CodecPort;
  blobStorage?: BlobStoragePort;
  patchBlobStorage?: BlobStoragePort;
}

/**
 * Creates a wormhole compressing a range of patches.
 *
 * The range is specified by two patch SHAs from the same writer. The `fromSha`
 * must be an ancestor of `toSha` in the writer's patch chain. Both endpoints
 * are inclusive in the wormhole.
 *
 * @throws {WormholeError} If fromSha or toSha doesn't exist (E_WORMHOLE_SHA_NOT_FOUND)
 * @throws {WormholeError} If fromSha is not an ancestor of toSha (E_WORMHOLE_INVALID_RANGE)
 * @throws {WormholeError} If commits span multiple writers (E_WORMHOLE_MULTI_WRITER)
 * @throws {WormholeError} If a commit is not a patch commit (E_WORMHOLE_NOT_PATCH)
 * @throws {EncryptionError} If patches are encrypted but no patchBlobStorage is provided
 */
export async function createWormhole({
  persistence,
  graphName,
  fromSha,
  toSha,
  commitMessageCodec,
  codec,
  blobStorage,
  patchBlobStorage,
}: CreateWormholeOptions): Promise<WormholeEdge> {
  validateSha(fromSha, 'fromSha');
  validateSha(toSha, 'toSha');
  await verifyShaExists(persistence, fromSha, 'fromSha');
  await verifyShaExists(persistence, toSha, 'toSha');

  const patches = await collectPatchRange({
    persistence,
    graphName,
    fromSha,
    toSha,
    ...(commitMessageCodec !== undefined ? { commitMessageCodec } : {}),
    ...(codec !== undefined ? { codec } : {}),
    ...(blobStorage !== undefined ? { blobStorage } : {}),
    ...(patchBlobStorage !== undefined ? { patchBlobStorage } : {}),
  });

  // Reverse to get oldest-first order (as required by ProvenancePayload)
  patches.reverse();

  const writerId = patches.length > 0 ? (patches[0]?.writerId ?? '') : '';
  // Strip writerId to match ProvenancePayload's PatchEntry typedef ({patch, sha})
  const payload = new ProvenancePayload(patches.map(({ patch, sha }) => ({ patch, sha })));

  return { fromSha, toSha, writerId, payload, patchCount: patches.length };
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
 * @throws {WormholeError} If wormholes are from different writers (E_WORMHOLE_MULTI_WRITER)
 * @throws {WormholeError} If wormholes are not consecutive (E_WORMHOLE_INVALID_RANGE)
 */
export async function composeWormholes(
  first: WormholeEdge,
  second: WormholeEdge,
  options: { persistence?: CommitPort } = {},
): Promise<WormholeEdge> {
  // Validate writer consistency
  if (first.writerId !== second.writerId) {
    throw new WormholeError(
      `Cannot compose wormholes from different writers: '${first.writerId}' and '${second.writerId}'`,
      {
        code: 'E_WORMHOLE_MULTI_WRITER',
        context: { firstWriter: first.writerId, secondWriter: second.writerId },
      },
    );
  }

  // If persistence is provided, validate that wormholes are consecutive
  if (options.persistence !== undefined && options.persistence !== null) {
    const secondFirstInfo = await options.persistence.getNodeInfo(second.fromSha);
    const parents = secondFirstInfo.parents ?? [];

    if (!Array.isArray(parents) || !parents.includes(first.toSha)) {
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
 */
export function replayWormhole(wormhole: WormholeEdge, initialState?: WarpState): WarpState {
  return wormhole.payload.replay(initialState);
}

/**
 * Serializes a wormhole to a JSON-serializable object.
 */
export function serializeWormhole(wormhole: WormholeEdge): Record<string, unknown> { // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  return {
    fromSha: wormhole.fromSha,
    toSha: wormhole.toSha,
    writerId: wormhole.writerId,
    patchCount: wormhole.patchCount,
    payload: wormhole.payload.entries(),
  };
}

/**
 * Deserializes a wormhole from a JSON object.
 *
 * @throws {WormholeError} If the JSON structure is invalid
 */
export function deserializeWormhole(json: Record<string, unknown>): WormholeEdge { // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  if (json === null || json === undefined || typeof json !== 'object') {
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

  for (const field of ['fromSha', 'toSha', 'writerId']) {
    if (typeof json[field] !== 'string') {
      throw new WormholeError(`Invalid wormhole JSON: '${field}' must be a string`, {
        code: 'E_INVALID_WORMHOLE_JSON',
        context: { [field]: json[field] },
      });
    }
  }

  const { patchCount } = json;
  if (typeof patchCount !== 'number' || patchCount < 0) {
    throw new WormholeError('Invalid wormhole JSON: patchCount must be a non-negative number', {
      code: 'E_INVALID_WORMHOLE_JSON',
      context: { patchCount },
    });
  }

  return {
    fromSha: json['fromSha'] as string,
    toSha: json['toSha'] as string,
    writerId: json['writerId'] as string,
    patchCount,
    payload: ProvenancePayload.fromEntries(json['payload'] as Array<{ patch: Patch; sha: string }>),
  };
}

export default {
  createWormhole,
  composeWormholes,
  replayWormhole,
  serializeWormhole,
  deserializeWormhole,
};
