import { blake3 } from '@noble/hashes/blake3.js';
import RetainedGraphError from '../errors/RetainedGraphError.ts';
import { hexEncode, textEncode } from '../utils/bytes.ts';

const DIGEST_PATTERN = /^[0-9a-f]{64}$/u;
const FIELD_DELIMITER = textEncode(':');

/**
 * The deterministic identity of a retained graph manifest (#815): BLAKE3 over
 * its fields in order, each written as its UTF-8 byte length in decimal, a
 * colon and its UTF-8 bytes. Length prefixes keep field boundaries, so no
 * field can absorb its neighbour. Schema 1 commits to the schema, layout,
 * geometry and writer frontier, and not to the record-trie root, so it is the
 * same for every fold order that reaches one frontier. The digest is a
 * persisted identity that graph references pin; its preimage changes only
 * with a new manifest schema. It is distinct from #1044 slice 1's basis
 * commitment over record digests, which schema 2 will add.
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
    const hasher = blake3.create({});
    for (const field of fields) {
      const bytes = textEncode(field);
      hasher.update(textEncode(String(bytes.length)));
      hasher.update(FIELD_DELIMITER);
      hasher.update(bytes);
    }
    return new ManifestCommitment(hexEncode(hasher.digest()));
  }

  equals(other: ManifestCommitment): boolean {
    return other.#digest === this.#digest;
  }

  toString(): string {
    return this.#digest;
  }
}
