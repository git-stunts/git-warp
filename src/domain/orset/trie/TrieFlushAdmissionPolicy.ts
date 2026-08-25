import type { DirtyPageEntry } from './DirtyPageSet.ts';
import TrieBranch from './TrieBranch.ts';
import TrieLeaf from './TrieLeaf.ts';

/** Conservative call bound: each leaf may need a page and bundle call; each branch one. */
export function trieFlushAdmissionOperationBound(
  entries: readonly DirtyPageEntry[],
): number {
  let operations = 0;
  for (const entry of entries) {
    if (entry.node instanceof TrieLeaf) {
      operations += 2;
    } else if (entry.node instanceof TrieBranch) {
      operations += 1;
    }
  }
  return operations;
}
