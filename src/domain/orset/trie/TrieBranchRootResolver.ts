import TrieFlushError from '../../errors/TrieFlushError.ts';
import {
  encodeDirtyPath,
  type default as DirtyPageSet,
} from './DirtyPageSet.ts';
import type TrieBranch from './TrieBranch.ts';
import type { TrieBranchEntries } from './TrieBranchEntries.ts';

const PENDING_OID_PREFIX = 'pending:';

/** Resolves one dirty branch against freshly written and structurally shared children. */
export default function resolveBranchChildren(args: {
  readonly branch: TrieBranch;
  readonly path: readonly number[];
  readonly dirty: DirtyPageSet;
  readonly newOidByPath: ReadonlyMap<string, string>;
}): TrieBranchEntries {
  const out = new Map<number, string>();
  for (const [nibble, originalOid] of args.branch.entries()) {
    const childPath = [...args.path, nibble];
    const resolved = resolveChildOid({
      originalOid,
      childPath,
      dirty: args.dirty,
      newOidByPath: args.newOidByPath,
    });
    out.set(nibble, resolved);
  }
  return out;
}

function resolveChildOid(args: {
  readonly originalOid: string;
  readonly childPath: readonly number[];
  readonly dirty: DirtyPageSet;
  readonly newOidByPath: ReadonlyMap<string, string>;
}): string {
  const freshlyWritten = args.newOidByPath.get(encodeDirtyPath(args.childPath));
  if (freshlyWritten !== undefined) {
    return freshlyWritten;
  }
  const cleanChild = args.dirty.cleanChildOidAt(args.childPath);
  if (cleanChild !== null) {
    return cleanChild;
  }
  if (!args.originalOid.startsWith(PENDING_OID_PREFIX)) {
    return args.originalOid;
  }
  const path = encodeDirtyPath(args.childPath);
  throw new TrieFlushError(
    `TrieFlusher could not resolve pending child OID at path=${path}`,
    {
      code: 'E_TRIE_FLUSH_UNRESOLVED',
      context: { path, pending: args.originalOid },
    },
  );
}
