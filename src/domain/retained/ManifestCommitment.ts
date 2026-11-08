import { blake3 } from '@noble/hashes/blake3.js';
import RetainedGraphError from '../errors/RetainedGraphError.ts';
import { concatBytes, hexEncode, textEncode } from '../utils/bytes.ts';

const DIGEST_PATTERN = /^[0-9a-f]{64}$/u;
const FIELD_DELIMITER = textEncode(':');

/**
 * The deterministic identity of a retained graph manifest (#815): BLAKE3 over
 * its fields in order, each written as its UTF-8 byte length in decimal, a
 * colon and its UTF-8 bytes. Length prefixes keep field boundaries, so no
 * field can absorb its neighbour. The digest is a persisted identity that
 * graph references pin; its preimage changes only with a new manifest schema.
 */
export default class ManifestCommitment {
  readonly #digest: string;

  constructor(digest: string) {
    if (!DIGEST_PATTERN.test(digest)) {
      throw new RetainedGraphError('Manifest commitment must be 64 lowercase hex characters', 'E_RETAINED_MANIFEST_INVALID', {
        context: { digest },
      });
    }
    this.#digest = digest;
    Object.freeze(this);
  }

  /** The commitment over `fields`, in order. */
  static over(fields: readonly string[]): ManifestCommitment {
    const preimage = concatBytes(...fields.flatMap((field) => {
      const bytes = textEncode(field);
      return [textEncode(String(bytes.length)), FIELD_DELIMITER, bytes];
    }));
    return new ManifestCommitment(hexEncode(blake3(preimage)));
  }

  equals(other: ManifestCommitment): boolean {
    return other.#digest === this.#digest;
  }

  toString(): string {
    return this.#digest;
  }
}
