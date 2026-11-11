import { CborCodec as GitCasCborCodec, type CodecPort as GitCasCodecPort } from '@git-stunts/git-cas';
import { requireBoundedCbor } from '../codecs/CborCodec.ts';
import GitCasManifestShapeGuard from './GitCasManifestShapeGuard.ts';

/**
 * The CBOR codec git-warp gives git-cas for asset manifests, bundle
 * descriptors and trust records.
 *
 * Encoding is git-cas's own `CborCodec`, so manifest bytes and tree OIDs do
 * not change. Decoding first applies the bounds of git-warp's `CborCodec`
 * (size, depth, item and container counts, definite lengths and the tag
 * allow-list), because peers replicate these blobs. A blob outside the bounds
 * is refused with `E_CBOR_DECODE_BOUNDS` before cbor-x reads it. A decoded
 * Merkle root manifest is then checked by `GitCasManifestShapeGuard`, before
 * git-cas reads its sub-manifests, and refused with `E_CAS_MANIFEST_SHAPE`.
 */
export default class BoundedGitCasCborCodec implements GitCasCodecPort {
  readonly #gitCasCodec = new GitCasCborCodec();
  readonly #manifestShape = new GitCasManifestShapeGuard();

  constructor() {
    Object.freeze(this);
  }

  encode(data: object): Uint8Array {
    return this.#gitCasCodec.encode(data);
  }

  decode(buffer: Uint8Array): object {
    requireBoundedCbor(buffer);
    const decoded = this.#gitCasCodec.decode(buffer);
    this.#manifestShape.check(decoded);
    return decoded;
  }

  get extension(): string {
    return this.#gitCasCodec.extension;
  }
}
