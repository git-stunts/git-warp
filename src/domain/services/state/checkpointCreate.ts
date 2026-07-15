/** Checkpoint preparation independent of its physical storage layout. */
import { computeStateHash } from './StateSerializer.ts';
import { computeAppliedVV } from './CheckpointSerializer.ts';
import { requireCodec } from '../codec/CodecRequirement.ts';
import { requireCrypto } from '../crypto/CryptoRequirement.ts';
import { cloneState } from '../JoinReducer.ts';
import type WarpState from './WarpState.ts';
import type CodecPort from '../../../ports/CodecPort.ts';
import type CryptoPort from '../../../ports/CryptoPort.ts';
import type CheckpointStorePort from '../../../ports/CheckpointStorePort.ts';
import type StateHashService from './StateHashService.ts';
import type { ProvenanceIndex } from '../provenance/ProvenanceIndex.ts';

export interface CreateCheckpointOptions {
  checkpointStore: CheckpointStorePort;
  graphName: string;
  state: WarpState;
  frontier: Map<string, string>;
  parents?: string[];
  compact?: boolean;
  provenanceIndex?: ProvenanceIndex;
  codec?: CodecPort;
  crypto?: CryptoPort;
  indexTree?: Readonly<Record<string, Uint8Array>>;
  stateHashService?: StateHashService;
}

export async function create(options: CreateCheckpointOptions): Promise<string> {
  return await createCheckpointEnvelope(options);
}

/**
 * Compacts and hashes checkpoint state, then delegates publication to the
 * configured checkpoint store. The domain never observes the resulting
 * object layout.
 */
export async function createCheckpointEnvelope({
  checkpointStore,
  graphName,
  state,
  frontier,
  parents = [],
  compact = true,
  provenanceIndex,
  codec,
  crypto,
  indexTree,
  stateHashService,
}: CreateCheckpointOptions): Promise<string> {
  const appliedVV = computeAppliedVV(state);
  let checkpointState = state;
  if (compact) {
    checkpointState = cloneState(state);
    checkpointState.nodeAlive.compact(appliedVV);
    checkpointState.edgeAlive.compact(appliedVV);
  }

  const stateHash = stateHashService !== undefined && stateHashService !== null
    ? await stateHashService.compute(checkpointState)
    : await computeStateHash(checkpointState, {
      codec: requireCodec(codec, 'createCheckpointEnvelope'),
      crypto: requireCrypto(crypto, 'createCheckpointEnvelope'),
    });

  const published = await checkpointStore.publishCheckpoint({
    graphName,
    state: checkpointState,
    frontier,
    appliedVV,
    stateHash,
    parents,
    ...(provenanceIndex === undefined ? {} : { provenanceIndex }),
    ...(indexTree === undefined ? {} : { indexShards: indexTree }),
  });
  return published.checkpointSha;
}
