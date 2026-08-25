import type { DirtyPageEntry } from './DirtyPageSet.ts';
import TrieBranch from './TrieBranch.ts';
import TrieLeaf from './TrieLeaf.ts';

export const TRIE_FLUSH_MAX_OPERATIONS_PER_DIRTY_PAGE = 2;
const TRIE_BRANCH_WRITE_OPERATIONS = 1;

/** Conservative call bound: each leaf may need a page and bundle call; each branch one. */
export function trieFlushAdmissionOperationBound(
  entries: readonly DirtyPageEntry[],
): number {
  let operations = 0;
  for (const entry of entries) {
    if (entry.node instanceof TrieLeaf) {
      operations += TRIE_FLUSH_MAX_OPERATIONS_PER_DIRTY_PAGE;
    } else if (entry.node instanceof TrieBranch) {
      operations += TRIE_BRANCH_WRITE_OPERATIONS;
    }
  }
  return operations;
}
