import type {
  AssetCapability,
  BundleCapability,
  PageCapability,
} from '@git-stunts/git-cas';
import type MaterializationCoordinate from '../../domain/materialization/MaterializationCoordinate.ts';
import type MaterializationRoot from '../../domain/materialization/MaterializationRoot.ts';
import type MaterializationRoots from '../../domain/materialization/MaterializationRoots.ts';
import type WarpState from '../../domain/services/state/WarpState.ts';
import type { ProvenanceIndex } from '../../domain/services/provenance/ProvenanceIndex.ts';
import type BundleHandle from '../../domain/storage/BundleHandle.ts';
import type CodecPort from '../../ports/CodecPort.ts';
import type CryptoPort from '../../ports/CryptoPort.ts';
import {
  decodeMaterializationDescriptor,
  MATERIALIZATION_DESCRIPTOR_MAX_BYTES,
  materializationRootsFromDescriptor,
  type DecodedMaterializationDescriptor,
} from './GitCasMaterializationDescriptor.ts';
import {
  decodeMaterializationMembers,
} from './GitCasMaterializationBundle.ts';
import GitCasMaterializationReplayBasis from './GitCasMaterializationReplayBasis.ts';
import { storageError } from './GitCasMaterializationStoreValidation.ts';
import GitCasMaterializationProvenanceSupport from './GitCasMaterializationProvenanceSupport.ts';

export type GitCasMaterializationSnapshotFacade = Readonly<{
  assets: Pick<AssetCapability, 'open'>;
  pages: Pick<PageCapability, 'get'>;
  bundles: Pick<
    BundleCapability,
    'getMemberReference' | 'iterateMemberReferences'
  >;
}>;

export type MaterializationSnapshot = Readonly<{
  coordinate: MaterializationCoordinate;
  roots: MaterializationRoots;
  state: WarpState;
  stateHash: string;
  provenanceIndex: ProvenanceIndex | null;
}>;

export type MaterializationBasisSnapshot = Pick<
  MaterializationSnapshot,
  'coordinate' | 'roots' | 'stateHash'
>;

/** Opens the canonical whole-state snapshot already retained by a materialization bundle. */
export default class GitCasMaterializationSnapshotReader {
  readonly #cas: GitCasMaterializationSnapshotFacade;
  readonly #codec: CodecPort;
  readonly #replayBasis: GitCasMaterializationReplayBasis;
  readonly #provenanceSupport: GitCasMaterializationProvenanceSupport;

  constructor(options: {
    cas: GitCasMaterializationSnapshotFacade;
    codec: CodecPort;
    crypto: CryptoPort;
  }) {
    this.#cas = options.cas;
    this.#codec = options.codec;
    this.#replayBasis = new GitCasMaterializationReplayBasis(options);
    this.#provenanceSupport = new GitCasMaterializationProvenanceSupport(options);
  }

  async read(bundle: BundleHandle): Promise<MaterializationSnapshot> {
    return await this.resolve(await this.readBasis(bundle));
  }

  async resolve(basis: MaterializationBasisSnapshot): Promise<MaterializationSnapshot> {
    const state = await this.#replayBasis.loadRoot(
      requireRetainedRoot(basis.roots.replayBasis, 'replay basis'),
      basis.stateHash,
    );
    const provenanceRoot = optionalRetainedRoot(basis.roots.provenanceSupport);
    const provenanceIndex = provenanceRoot === null
      ? null
      : await this.#provenanceSupport.loadRoot(provenanceRoot);
    return Object.freeze({
      ...basis,
      state,
      provenanceIndex,
    });
  }

  async readBasis(bundle: BundleHandle): Promise<MaterializationBasisSnapshot> {
    const members = await decodeMaterializationMembers(
      this.#cas.bundles.iterateMemberReferences({ handle: bundle.toString() }),
    );
    const descriptor = requireWholeStateDescriptor(
      decodeMaterializationDescriptor(this.#codec.decode(
        await this.#cas.pages.get({
          handle: members.descriptor,
          maxBytes: MATERIALIZATION_DESCRIPTOR_MAX_BYTES,
        }),
      )),
    );
    const roots = materializationRootsFromDescriptor(descriptor, members.retainedRoots);
    return Object.freeze({
      coordinate: descriptor.coordinate,
      roots,
      stateHash: descriptor.stateHash,
    });
  }
}

function requireWholeStateDescriptor(
  descriptor: DecodedMaterializationDescriptor,
): DecodedMaterializationDescriptor & { readonly stateHash: string } {
  if (descriptor.stateHash === null) {
    throw storageError('checkpoint materialization is partial');
  }
  return descriptor as DecodedMaterializationDescriptor & { readonly stateHash: string };
}

function requireRetainedRoot(root: MaterializationRoot, name: string): BundleHandle {
  const retained = optionalRetainedRoot(root);
  if (retained === null) {
    throw storageError(`checkpoint materialization has no ${name}`);
  }
  return retained;
}

function optionalRetainedRoot(root: MaterializationRoot): BundleHandle | null {
  return root.status === 'retained' ? root.handle : null;
}
