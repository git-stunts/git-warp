import { describe, expect, it } from 'vitest';
import GitConeRecordTrie, { CONE_TRIE_BUCKET_RECORDS } from '../../../../src/infrastructure/adapters/GitConeRecordTrie.ts';
import GitFastImportTreeScript from '../../../../src/infrastructure/adapters/GitFastImportTreeScript.ts';
import type { GitTreeObjectEntry } from '../../../../src/infrastructure/adapters/GitTreeObjectEntry.ts';
import { textDecode } from '../../../../src/domain/utils/bytes.ts';

const OID = (index: number): string => index.toString(16).padStart(40, '0');
const route = (prefix: string, index = 0): string => `${prefix}${index.toString(16).padStart(64 - prefix.length, '0')}`;
const blob = (name: string, oid = OID(1)): GitTreeObjectEntry => ({ mode: '100644', type: 'blob', oid, name });
const tree = (name: string, oid: string): GitTreeObjectEntry => ({ mode: '040000', type: 'tree', oid, name });

/** A trie over in-memory trees: tree id → entries. */
function trieOver(trees: Record<string, readonly GitTreeObjectEntry[]>): GitConeRecordTrie {
  return new GitConeRecordTrie(async (oid) => {
    const entries = trees[oid];
    if (entries === undefined) {
      throw new Error(`no tree ${oid}`);
    }
    return entries;
  });
}

/** The fast-import commands a script holds, one per line, without its header and trailer. */
function commands(script: GitFastImportTreeScript): string[] {
  return textDecode(script.encode()).split('\n').filter((line) => /^(?:M|D) /u.test(line));
}

describe('GitConeRecordTrie', () => {
  it('locates records in buckets and through digit branches, and reports absent routes', async () => {
    const deep = route('ab', 1);
    const trie = trieOver({
      root: [tree('a', 'branchA'), tree('c', 'bucketC')],
      branchA: [tree('b', 'bucketAB')],
      bucketAB: [blob(deep, OID(7))],
      bucketC: [blob(route('c'), OID(8))],
    });
    expect(await trie.locate('root', deep)).toBe(OID(7));
    expect(await trie.locate('root', route('c'))).toBe(OID(8));
    expect(await trie.locate('root', route('c', 9))).toBeNull();
    expect(await trie.locate('root', route('e'))).toBeNull();
    expect(await trie.locate('root', route('ac'))).toBeNull();
  });

  it('refuses entries of the wrong type while locating', async () => {
    const trie = trieOver({ root: [blob('a'), tree(route('b'), 'x')] });
    await expect(trie.locate('root', route('a'))).rejects.toMatchObject({ code: 'E_CONE_RECORD_CORRUPT' });
    await expect(trie.locate('root', route('b'))).rejects.toMatchObject({ code: 'E_CONE_RECORD_CORRUPT' });
  });

  it('writes into a bucket while it has room', async () => {
    const script = new GitFastImportTreeScript();
    await trieOver({ bucket: [blob(route('1'))] }).place(script, { path: 'n', treeOid: 'bucket' }, new Map([[route('1'), new Uint8Array([1])], [route('2'), new Uint8Array([2])]]));
    expect(commands(script)).toEqual([`M 100644 inline n/${route('1')}`, `M 100644 inline n/${route('2')}`]);
  });

  it('splits an overflowing bucket, moving its stored records by blob id', async () => {
    const stored = Array.from({ length: CONE_TRIE_BUCKET_RECORDS }, (_unused, index) => blob(route('3', index), OID(index + 1)));
    const script = new GitFastImportTreeScript();
    await trieOver({ bucket: stored }).place(script, { path: 'e', treeOid: 'bucket' }, new Map([[route('4'), new Uint8Array([4])]]));
    const lines = commands(script);
    expect(lines[0]).toBe('D e');
    expect(lines).toContain(`M 100644 inline e/4/${route('4')}`);
    expect(lines).toContain(`M 100644 ${OID(1)} e/3/${route('3', 0)}`);
    expect(lines).toHaveLength(CONE_TRIE_BUCKET_RECORDS + 2);
  });

  it('places an overflowing first write straight into digit directories', async () => {
    const records = new Map(Array.from({ length: CONE_TRIE_BUCKET_RECORDS + 1 }, (_unused, index) => [route(index % 2 === 0 ? '5' : '6', index), new Uint8Array([index])]));
    const script = new GitFastImportTreeScript();
    await trieOver({}).place(script, { path: 'a', treeOid: null }, records);
    const lines = commands(script);
    expect(lines.some((line) => line.startsWith('D '))).toBe(false);
    expect(lines.every((line) => /^M 100644 inline a\/[56]\/[0-9a-f]{64}$/u.test(line))).toBe(true);
  });

  it('splits again wherever one digit still holds more than a bucket', async () => {
    const records = new Map(Array.from({ length: CONE_TRIE_BUCKET_RECORDS + 1 }, (_unused, index) => [route(index % 2 === 0 ? '5a' : '5b', index), new Uint8Array([index])]));
    const script = new GitFastImportTreeScript();
    await trieOver({}).place(script, { path: 'a', treeOid: null }, records);
    expect(commands(script).every((line) => /^M 100644 inline a\/5\/[ab]\/5[ab][0-9a-f]{62}$/u.test(line))).toBe(true);
  });

  it('descends existing branches and creates missing digit directories', async () => {
    const script = new GitFastImportTreeScript();
    const trie = trieOver({ branch: [tree('7', 'bucket7')], bucket7: [blob(route('7'))] });
    await trie.place(script, { path: 'd', treeOid: 'branch' }, new Map([[route('7', 1), new Uint8Array([1])], [route('8'), new Uint8Array([2])]]));
    expect(commands(script)).toEqual([`M 100644 inline d/7/${route('7', 1)}`, `M 100644 inline d/8/${route('8')}`]);
  });

  it('refuses malformed directories and routes while placing', async () => {
    const one = new Map([[route('1'), new Uint8Array([1])]]);
    const place = async (trees: Record<string, readonly GitTreeObjectEntry[]>, records = one): Promise<void> => {
      await trieOver(trees).place(new GitFastImportTreeScript(), { path: 'n', treeOid: 'top' }, records);
    };
    await expect(place({ top: [tree('xy', 'child')] })).rejects.toMatchObject({ code: 'E_CONE_RECORD_CORRUPT' });
    await expect(place({ top: [tree('1', 'child'), blob('2')] })).rejects.toMatchObject({ code: 'E_CONE_RECORD_CORRUPT' });
    await expect(place({ top: [blob('not-a-route')] })).rejects.toMatchObject({ code: 'E_CONE_RECORD_CORRUPT' });
    await expect(place({ top: [] }, new Map([['XYZ', new Uint8Array([1])]]))).rejects.toMatchObject({ code: 'E_CONE_RECORD_INVALID' });
  });
});
