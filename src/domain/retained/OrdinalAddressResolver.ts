import RetainedGraphError from '../errors/RetainedGraphError.ts';
import type ConeRecordStorePort from '../../ports/ConeRecordStorePort.ts';
import type GraphOrdinal from './GraphOrdinal.ts';
import type ManifestOrdinal from './ManifestOrdinal.ts';
import type OrdinalAddress from './OrdinalAddress.ts';
import OrdinalAddressPage from './OrdinalAddressPage.ts';
import type RetainedGraphManifest from './RetainedGraphManifest.ts';

/**
 * Resolves graph-local ordinals to typed record addresses under a retained
 * manifest (#815). Each resolution reads exactly one record, the ordinal's
 * address page, and no sibling page or element record. An ordinal outside
 * the manifest reads nothing and fails closed.
 */
export default class OrdinalAddressResolver {
  readonly #store: ConeRecordStorePort;

  constructor(store: ConeRecordStorePort) {
    this.#store = store;
  }

  /** The address page holding `ordinal` under `manifest`. */
  async openPage(manifest: RetainedGraphManifest, ordinal: GraphOrdinal): Promise<OrdinalAddressPage> {
    manifest.requireOrdinal(ordinal);
    const snapshot = await this.#store.readRecords(manifest.basis.root, [OrdinalAddressPage.keyOf(ordinal, manifest.geometry)]);
    const page = snapshot.dotPage(ordinal.kind, ordinal.writerId, manifest.geometry.pageIndexOf(ordinal.counter));
    return new OrdinalAddressPage(manifest.geometry, page);
  }

  async resolve(manifest: RetainedGraphManifest, ordinal: GraphOrdinal): Promise<OrdinalAddress> {
    return (await this.openPage(manifest, ordinal)).resolve(ordinal);
  }

  /** Resolves a pinned ordinal, refusing any manifest other than the one it was pinned to. */
  async resolvePinned(manifest: RetainedGraphManifest, pinned: ManifestOrdinal): Promise<OrdinalAddress> {
    if (!pinned.commitment.equals(manifest.commitment)) {
      throw new RetainedGraphError('Pinned ordinal belongs to another retained manifest', 'E_RETAINED_MANIFEST_MISMATCH', {
        context: { pinned: pinned.commitment.toString(), manifest: manifest.commitment.toString() },
      });
    }
    return await this.resolve(manifest, pinned.ordinal);
  }
}
