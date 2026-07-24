import type {
  AssetCapability,
  AssetHandle,
  BundleCapability,
  BundleMemberReference,
} from '@git-stunts/git-cas';
import MaterializationHandle from '../../domain/materialization/MaterializationHandle.ts';
import MaterializationRoot from '../../domain/materialization/MaterializationRoot.ts';
import MaterializationRoots from '../../domain/materialization/MaterializationRoots.ts';
import type WarpState from '../../domain/services/state/WarpState.ts';
import { computeStateHash } from '../../domain/services/state/StateSerializer.ts';
import WarpStream from '../../domain/stream/WarpStream.ts';
import BundleHandle from '../../domain/storage/BundleHandle.ts';
import { collectAsyncIterable } from '../../domain/utils/streamUtils.ts';
import type CodecPort from '../../ports/CodecPort.ts';
import type CryptoPort from '../../ports/CryptoPort.ts';
import {
  decodeCanonicalWarpFullState,
  encodeWarpFullState,
} from '../codecs/WarpStateCborCodec.ts';
import type {
  GitCasStagingWorkspace,
} from './GitCasMaterializationWorkspace.ts';
import { storageError } from './GitCasMaterializationStoreValidation.ts';

const REPLAY_BASIS_PATH = 'state.cbor';

type ReplayBasisFacade = Readonly<{
  assets: Pick<AssetCapability, 'open'>;
  bundles: Pick<BundleCapability, 'getMemberReference'>;
}>;

/** Stages and verifies the compatibility state attached to retained materializations. */
export default class GitCasMaterializationReplayBasis {
  readonly #cas: ReplayBasisFacade;
  readonly #codec: CodecPort;
  readonly #crypto: CryptoPort;

  constructor(options: {
    readonly cas: ReplayBasisFacade;
    readonly codec: CodecPort;
    readonly crypto: CryptoPort;
  }) {
    this.#cas = options.cas;
    this.#codec = options.codec;
    this.#crypto = options.crypto;
  }

  async stage(
    workspace: GitCasStagingWorkspace,
    state: WarpState,
  ): Promise<MaterializationRoot> {
    const bytes = encodeWarpFullState(state, this.#codec);
    const asset = await workspace.assets.put({
      source: WarpStream.from([bytes]),
      slug: 'git-warp-materialization-replay-basis',
      filename: REPLAY_BASIS_PATH,
    });
    const bundle = await workspace.bundles.putOrdered({
      members: [[REPLAY_BASIS_PATH, asset.handle]],
      limits: { maxMembers: 1 },
    });
    return MaterializationRoot.retained(new BundleHandle(bundle.handle.toString()));
  }

  async load(materialization: MaterializationHandle): Promise<WarpState | null> {
    if (!(materialization instanceof MaterializationHandle)) {
      throw storageError('replay basis requires a MaterializationHandle');
    }
    const root = materialization.roots.replayBasis;
    if (root.status !== 'retained' || root.handle === null) {
      return null;
    }
    const member = await this.#cas.bundles.getMemberReference({
      handle: root.handle.toString(),
      path: REPLAY_BASIS_PATH,
    });
    const asset = requireReplayAsset(member);
    const bytes = await collectAsyncIterable(this.#cas.assets.open({ handle: asset }));
    const state = decodeCanonicalWarpFullState(bytes, this.#codec);
    await this.#requireMatchingHash(state, materialization.stateHash);
    return state;
  }

  async #requireMatchingHash(state: WarpState, expected: string): Promise<void> {
    const actual = await computeStateHash(state, {
      codec: this.#codec,
      crypto: this.#crypto,
    });
    if (actual !== expected) {
      throw storageError('replay basis state hash does not match its descriptor');
    }
  }
}

export function replaceReplayBasisRoot(
  roots: MaterializationRoots,
  replayBasis: MaterializationRoot,
): MaterializationRoots {
  return new MaterializationRoots({
    adjacency: roots.adjacency,
    edgeAlive: roots.edgeAlive,
    edgeBirths: roots.edgeBirths,
    frontier: roots.frontier,
    nodeAlive: roots.nodeAlive,
    properties: roots.properties,
    provenanceSupport: roots.provenanceSupport,
    replayBasis,
    roaringIndexes: roots.roaringIndexes,
  });
}

function requireReplayAsset(member: BundleMemberReference | null): AssetHandle {
  if (member === null || member.handle.kind !== 'asset') {
    throw storageError('replay basis root has no state asset');
  }
  return member.handle;
}
