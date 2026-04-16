/**
 * Nibble-name parser for `GitTrieStoreAdapter`'s branch tree reads.
 *
 * Branch tree entries in the shadow-trie ORSet are named by nibble
 * index in lowercase hex, zero-padded to the minimum width required
 * by the branch's fanout. Valid names are non-empty strings
 * consisting only of lowercase hex characters (`0`-`9`, `a`-`f`).
 *
 * The adapter does not validate that the decoded index falls in a
 * geometry-specific range — it just decodes the number. Geometry
 * enforcement is the codec's problem.
 *
 * Any malformed name raises `TrieStoreError` with code
 * `E_TRIE_STORE_CORRUPT`. Consumers `instanceof`-dispatch on the
 * error class and branch on `code` if they care which failure they
 * hit.
 *
 * @see GitTrieStoreAdapter
 * @see TrieStoreError
 */
import TrieStoreError from '../../domain/errors/TrieStoreError.ts';

const E_TRIE_STORE_CORRUPT = 'E_TRIE_STORE_CORRUPT';
const LOWERCASE_HEX_NAME = /^[0-9a-f]+$/;

/**
 * Parse a Git tree entry name as a nibble index.
 *
 * @param name - the raw tree entry filename
 * @returns the decoded nibble index (non-negative integer)
 * @throws {TrieStoreError} with code `E_TRIE_STORE_CORRUPT` when the
 *   name is empty, contains non-hex characters, or fails to parse as
 *   a non-negative integer
 */
export function parseNibbleName(name: string): number {
  assertNonEmpty(name);
  assertLowercaseHex(name);
  const parsed = Number.parseInt(name, 16);
  assertNibbleValue(name, parsed);
  return parsed;
}

function assertNonEmpty(name: string): void {
  if (name.length > 0) {
    return;
  }
  throw new TrieStoreError('empty tree entry name in trie branch', {
    code: E_TRIE_STORE_CORRUPT,
    context: { name },
  });
}

function assertLowercaseHex(name: string): void {
  if (LOWERCASE_HEX_NAME.test(name)) {
    return;
  }
  throw new TrieStoreError(
    `tree entry name "${name}" is not a lowercase hex nibble`,
    { code: E_TRIE_STORE_CORRUPT, context: { name } },
  );
}

function assertNibbleValue(name: string, parsed: number): void {
  if (Number.isInteger(parsed) && parsed >= 0) {
    return;
  }
  throw new TrieStoreError(
    `tree entry name "${name}" parses to a non-nibble value`,
    { code: E_TRIE_STORE_CORRUPT, context: { name, parsed } },
  );
}
