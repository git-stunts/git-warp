import { describe, expect, it } from 'vitest';
import InMemoryGraphAdapter from '../../../helpers/InMemoryGraphAdapter.ts';
import TreeEntryPath from '../../../../src/domain/tree/TreeEntryPath.ts';
import TreeEntryLimit from '../../../../src/domain/tree/TreeEntryLimit.ts';
import TreeEntryMissing from '../../../../src/domain/tree/TreeEntryMissing.ts';
import type { CommitLogChunk } from '../../../../src/ports/CommitPort.ts';

const MISSING = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);
const REF = 'refs/test/hash-compatibility';

describe('InMemoryGraphAdapter compatibility after hash capability capture', () => {
  it('preserves empty-tree and unavailable-tree reads', async () => {
    const adapter = new InMemoryGraphAdapter();
    const path = new TreeEntryPath('nested/file');
    const limit = new TreeEntryLimit(10);
    expect(await adapter.readTreeEntryOid(adapter.emptyTree, path)).toBeInstanceOf(TreeEntryMissing);
    expect((await adapter.readTreeEntryPrefix(adapter.emptyTree, path, limit)).entries).toEqual([]);
    await expect(adapter.readTreeEntryOid(MISSING, path)).rejects.toMatchObject({ code: 'E_MISSING_OBJECT' });
    await expect(adapter.readTreeEntryPrefix(MISSING, path, limit)).rejects.toMatchObject({ code: 'E_MISSING_OBJECT' });
  });

  it('keeps tree identity and prefix ordering deterministic for repeated paths', async () => {
    const adapter = new InMemoryGraphAdapter();
    const blob = await adapter.writeBlob('payload');
    const tree = await adapter.writeTree([
      `100644 blob ${blob}\tnested/z`,
      `100644 blob ${blob}\tnested/a`,
      `100644 blob ${blob}\tnested/a`,
    ]);
    const result = await adapter.readTreeEntryPrefix(tree, new TreeEntryPath('nested'), new TreeEntryLimit(10));
    expect(result.entries.map(entry => entry.path.value)).toEqual(['nested/a', 'nested/a', 'nested/z']);
    const root = await adapter.commitNode({ message: 'root' });
    const commit = await adapter.commitNodeWithTree({ treeOid: tree, parents: [root], message: 'tree' });
    expect(await adapter.getCommitTree(commit)).toBe(tree);
    expect((await adapter.getNodeInfo(commit)).parents).toEqual([root]);
  });

  it('preserves compare-and-delete and compare-and-swap mismatch behavior', async () => {
    const adapter = new InMemoryGraphAdapter();
    expect(await adapter.compareAndDeleteRef(REF, MISSING)).toBe(false);
    await adapter.updateRef(REF, MISSING);
    expect(await adapter.compareAndDeleteRef(REF, OTHER)).toBe(false);
    await expect(adapter.compareAndSwapRef(REF, OTHER, '')).rejects.toMatchObject({ code: 'E_REF_IO' });
    await expect(adapter.compareAndSwapRef(REF, OTHER, null)).rejects.toMatchObject({ code: 'E_REF_IO' });
    expect(await adapter.readRef(REF)).toBe(MISSING);
    await adapter.compareAndSwapRef(REF, OTHER, MISSING);
    expect(await adapter.compareAndDeleteRef(REF, OTHER)).toBe(true);
    await expect(adapter.compareAndSwapRef(REF, OTHER, MISSING)).rejects.toMatchObject({ code: 'E_REF_IO' });
  });

  it('retains formatted empty logs and missing-parent traversal semantics', async () => {
    const adapter = new InMemoryGraphAdapter();
    expect(await adapter.logNodes({ ref: REF, format: '%H' })).toBe('');
    const chunks: CommitLogChunk[] = [];
    for await (const chunk of await adapter.logNodesStream({ ref: REF })) chunks.push(chunk);
    expect(chunks).toEqual(['']);
    const root = await adapter.commitNode({ message: 'root', parents: [MISSING] });
    const left = await adapter.commitNode({ message: 'left', parents: [root] });
    const right = await adapter.commitNode({ message: 'right', parents: [root] });
    const merge = await adapter.commitNode({ message: 'merge', parents: [left, right, root] });
    await adapter.updateRef(REF, merge);
    expect(await adapter.countNodes(REF)).toBe(4);
    const log = await adapter.logNodes({ ref: REF, format: '%H' });
    for (const oid of [root, left, right, merge]) expect(log).toContain(oid);
    expect(await adapter.logNodes({ ref: REF, stopAt: merge, format: '%H' })).toBe('');
    const repeatedAncestor = await adapter.commitNode({ message: 'ancestor first', parents: [root, left] });
    const ancestorFirstLog = await adapter.logNodes({ ref: repeatedAncestor, format: '%H' });
    expect(ancestorFirstLog.split('\0').filter(Boolean)).toHaveLength(3);
    for (const oid of [root, left, repeatedAncestor]) expect(ancestorFirstLog).toContain(oid);
  });
});
