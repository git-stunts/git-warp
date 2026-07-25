import type {
  AssetCapability,
  AssetHandle,
  BundleCapability,
  BundleMemberReference,
} from '@git-stunts/git-cas';
import MaterializationRoot from '../../domain/materialization/MaterializationRoot.ts';
import type MaterializationRoots from '../../domain/materialization/MaterializationRoots.ts';
import { ProvenanceIndex } from '../../domain/services/provenance/ProvenanceIndex.ts';
import BundleHandle from '../../domain/storage/BundleHandle.ts';
import WarpStream from '../../domain/stream/WarpStream.ts';
import { collectAsyncIterable } from '../../domain/utils/streamUtils.ts';
import type CodecPort from '../../ports/CodecPort.ts';
import type { GitCasStagingWorkspace } from './GitCasMaterializationWorkspace.ts';
import { storageError } from './GitCasMaterializationStoreValidation.ts';

const PROVENANCE_PATH = 'provenance.cbor';

type ProvenanceSupportFacade = Readonly<{
  assets: Pick<AssetCapability, 'open'>;
  bundles: Pick<BundleCapability, 'getMemberReference'>;
}>;

/** Stages and opens the complete provenance index retained with a materialization. */
export default class GitCasMaterializationProvenanceSupport {
  readonly #cas: ProvenanceSupportFacade;
  readonly #codec: CodecPort;

  constructor(options: { cas: ProvenanceSupportFacade; codec: CodecPort }) {
    this.#cas = options.cas;
    this.#codec = options.codec;
  }

  async stage(
    workspace: GitCasStagingWorkspace,
    provenance: ProvenanceIndex,
  ): Promise<MaterializationRoot> {
    const asset = await workspace.assets.put({
      source: WarpStream.from([provenance.serialize({ codec: this.#codec })]),
      slug: 'git-warp-materialization-provenance',
      filename: PROVENANCE_PATH,
    });
    const bundle = await workspace.bundles.putOrdered({
      members: [[PROVENANCE_PATH, asset.handle]],
      limits: { maxMembers: 1 },
    });
    return MaterializationRoot.retained(new BundleHandle(bundle.handle.toString()));
  }

  async loadRoot(root: BundleHandle): Promise<ProvenanceIndex> {
    const member = await this.#cas.bundles.getMemberReference({
      handle: root.toString(),
      path: PROVENANCE_PATH,
    });
    const asset = requireProvenanceAsset(member);
    return ProvenanceIndex.deserialize(
      await collectAsyncIterable(this.#cas.assets.open({ handle: asset })),
      { codec: this.#codec },
    );
  }
}

export function replaceProvenanceSupportRoot(
  roots: MaterializationRoots,
  provenanceSupport: MaterializationRoot,
): MaterializationRoots {
  return roots.withRoot('provenance-support', provenanceSupport);
}

function requireProvenanceAsset(member: BundleMemberReference | null): AssetHandle {
  if (member === null || member.handle.kind !== 'asset') {
    throw storageError('provenance support root has no provenance asset');
  }
  return member.handle;
}
