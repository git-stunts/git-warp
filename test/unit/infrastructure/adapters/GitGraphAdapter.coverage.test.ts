import { describe, it, expect, vi, beforeEach } from 'vitest';
import PersistenceError from '../../../../src/domain/errors/PersistenceError.ts';
import TreeEntryFound from '../../../../src/domain/tree/TreeEntryFound.ts';
import TreeEntryLimit from '../../../../src/domain/tree/TreeEntryLimit.ts';
import TreeEntryMissing from '../../../../src/domain/tree/TreeEntryMissing.ts';
import TreeEntryPath from '../../../../src/domain/tree/TreeEntryPath.ts';
import GitGraphAdapter from '../../../../src/infrastructure/adapters/GitGraphAdapter.ts';
import { createGitRepo } from '../../../helpers/warpGraphTestUtils.ts';
import { describeAdapterConformance } from './AdapterConformance.ts';

function streamFromText(text: string): AsyncIterable<Uint8Array> {
  return {
    async *[Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
      if (text.length > 0) {
        yield Buffer.from(text);
      }
    },
  };
}

let mockPlumbing;
let adapter;

beforeEach(() => {
  mockPlumbing = {
    emptyTree: '4b825dc642cb6eb9a060e54bf8d69288fbee4904',
    execute: vi.fn(),
    executeStream: vi.fn(),
  };
  adapter = new GitGraphAdapter({ plumbing: mockPlumbing });
});

describe('GitGraphAdapter coverage', () => {
  // ── logNodes ────────────────────────────────────────────────────────

  describe('logNodes()', () => {
    it('calls git log with default limit and ref', async () => {
      mockPlumbing.execute.mockResolvedValue('commit abc123\n');

      const result = await adapter.logNodes({ ref: 'HEAD' });

      expect(result).toBe('commit abc123\n');
      expect(mockPlumbing.execute).toHaveBeenCalledWith({
        args: ['log', '-50', 'HEAD'],
      });
    });

    it('passes custom limit to git log', async () => {
      mockPlumbing.execute.mockResolvedValue('');

      await adapter.logNodes({ ref: 'main', limit: 10 });

      expect(mockPlumbing.execute).toHaveBeenCalledWith({
        args: ['log', '-10', 'main'],
      });
    });

    it('appends --format when format is provided', async () => {
      mockPlumbing.execute.mockResolvedValue('abc123\n');

      await adapter.logNodes({ ref: 'HEAD', limit: 5, format: '%H' });

      expect(mockPlumbing.execute).toHaveBeenCalledWith({
        args: ['log', '-5', '--format=%H', 'HEAD'],
      });
    });

    it('omits --format when format is not provided', async () => {
      mockPlumbing.execute.mockResolvedValue('');

      await adapter.logNodes({ ref: 'HEAD' });

      const args = mockPlumbing.execute.mock.calls[0][0].args;
      const hasFormat = (args).some((a) => a.startsWith('--format='));
      expect(hasFormat).toBe(false);
    });

    it('validates ref before calling git', async () => {
      await expect(adapter.logNodes({ ref: '--malicious' }))
        .rejects.toThrow(/Invalid ref/);

      expect(mockPlumbing.execute).not.toHaveBeenCalled();
    });

    it('rejects empty ref', async () => {
      await expect(adapter.logNodes({ ref: '' }))
        .rejects.toThrow(/non-empty string/);
    });

    it('validates limit must be a finite number', async () => {
      await expect(adapter.logNodes({ ref: 'HEAD', limit: Infinity }))
        .rejects.toThrow(/finite number/);
    });

    it('validates limit must be a positive integer', async () => {
      await expect(adapter.logNodes({ ref: 'HEAD', limit: 0 }))
        .rejects.toThrow(/positive integer/);
    });

    it('validates limit must be an integer', async () => {
      await expect(adapter.logNodes({ ref: 'HEAD', limit: 1.5 }))
        .rejects.toThrow(/integer/);
    });

    it('validates limit cannot exceed maximum', async () => {
      await expect(adapter.logNodes({ ref: 'HEAD', limit: 10_000_001 }))
        .rejects.toThrow(/too large/);
    });

    it('accepts limit at maximum boundary', async () => {
      mockPlumbing.execute.mockResolvedValue('');

      await adapter.logNodes({ ref: 'HEAD', limit: 10_000_000 });

      expect(mockPlumbing.execute).toHaveBeenCalledWith({
        args: ['log', '-10000000', 'HEAD'],
      });
    });

    it('wraps ref-not-found errors as PersistenceError', async () => {
      const err = (new Error('fatal: bad revision refs/warp/missing') as any);
      err.details = { code: 128, stderr: 'fatal: bad revision refs/warp/missing' };
      mockPlumbing.execute.mockRejectedValue(err);

      await expect(adapter.logNodes({ ref: 'refs/warp/missing' }))
        .rejects.toMatchObject({
          code: PersistenceError.E_REF_NOT_FOUND,
          message: 'Ref not found: refs/warp/missing',
        });
    });
  });

  // ── readTree ────────────────────────────────────────────────────────

  describe('readTree()', () => {
    it('reads each blob content for entries in the tree', async () => {
      const treeOid = 'aabb' + '0'.repeat(36);
      const treeOutput =
        `100644 blob deadbeef01234567890123456789012345678901\tfile_a.json\0` +
        `100644 blob cafebabe01234567890123456789012345678901\tfile_b.json\0`;
      mockPlumbing.execute.mockResolvedValue(treeOutput);
      mockPlumbing.executeStream.mockImplementation(async ({ args }) => {
        return streamFromText(args[2] === 'deadbeef01234567890123456789012345678901' ? 'content_a' : 'content_b');
      });

      const result = await adapter.readTree(treeOid);

      expect(result['file_a.json']).toEqual(new TextEncoder().encode('content_a'));
      expect(result['file_b.json']).toEqual(new TextEncoder().encode('content_b'));
      expect(mockPlumbing.execute).toHaveBeenCalledWith({
        args: ['ls-tree', '-rz', treeOid],
      });
      expect(mockPlumbing.executeStream).toHaveBeenCalledTimes(2);
    });

    it('returns empty map for empty tree', async () => {
      const treeOid = 'aabb' + '0'.repeat(36);
      mockPlumbing.execute.mockResolvedValue('');

      const result = await adapter.readTree(treeOid);

      expect(result).toEqual({});
      expect(mockPlumbing.execute).toHaveBeenCalledWith({
        args: ['ls-tree', '-rz', treeOid],
      });
      expect(mockPlumbing.executeStream).not.toHaveBeenCalled();
    });

    it('validates tree OID', async () => {
      await expect(adapter.readTree('invalid!oid'))
        .rejects.toThrow(/Invalid OID format/);
    });
  });

  // ── readTreeOids ────────────────────────────────────────────────────

  describe('readTreeOids()', () => {
    it('parses NUL-separated ls-tree output into path-oid map', async () => {
      const treeOid = 'aabb' + '0'.repeat(36);
      mockPlumbing.execute.mockResolvedValue(
        '100644 blob deadbeefdeadbeefdeadbeefdeadbeefdeadbeef\tindex.json\0' +
        '100644 blob cafebabecafebabecafebabecafebabecafebabe\tdata.json\0'
      );

      const result = await adapter.readTreeOids(treeOid);

      expect(result).toEqual({
        'index.json': 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
        'data.json': 'cafebabecafebabecafebabecafebabecafebabe',
      });
      expect(mockPlumbing.execute).toHaveBeenCalledWith({
        args: ['ls-tree', '-rz', treeOid],
      });
      expect(mockPlumbing.executeStream).not.toHaveBeenCalled();
    });

    it('returns empty map when tree has no entries', async () => {
      const treeOid = 'aabb' + '0'.repeat(36);
      mockPlumbing.execute.mockResolvedValue('');

      const result = await adapter.readTreeOids(treeOid);

      expect(result).toEqual({});
    });

    it('throws on records without a tab separator', async () => {
      const treeOid = 'aabb' + '0'.repeat(36);
      mockPlumbing.execute.mockResolvedValue(
        '100644 blob deadbeefdeadbeefdeadbeefdeadbeefdeadbeef\tvalid.json\0' +
        'malformed-no-tab\0'
      );

      await expect(adapter.readTreeOids(treeOid))
        .rejects.toThrow(/Malformed ls-tree entry/);
    });

    it('throws on records with malformed metadata field counts', async () => {
      const treeOid = 'aabb' + '0'.repeat(36);
      mockPlumbing.execute.mockResolvedValue(
        '100644 blob deadbeefdeadbeefdeadbeefdeadbeefdeadbeef extra\tbad.json\0'
      );

      await expect(adapter.readTreeOids(treeOid))
        .rejects.toThrow(/Malformed ls-tree entry/);
    });

    it('throws on records with empty metadata fields', async () => {
      const treeOid = 'aabb' + '0'.repeat(36);
      mockPlumbing.execute.mockResolvedValue(
        '100644  deadbeefdeadbeefdeadbeefdeadbeefdeadbeef\tbad.json\0'
      );

      await expect(adapter.readTreeOids(treeOid))
        .rejects.toThrow(/Malformed ls-tree entry/);
    });

    it('throws on records with empty paths', async () => {
      const treeOid = 'aabb' + '0'.repeat(36);
      mockPlumbing.execute.mockResolvedValue(
        '100644 blob deadbeefdeadbeefdeadbeefdeadbeefdeadbeef\t\0'
      );

      await expect(adapter.readTreeOids(treeOid))
        .rejects.toThrow(/Malformed ls-tree entry/);
    });

    it('handles single entry with trailing NUL', async () => {
      const treeOid = 'aabb' + '0'.repeat(36);
      mockPlumbing.execute.mockResolvedValue(
        '100644 blob abcdef1234567890abcdef1234567890abcdef12\tonly.json\0'
      );

      const result = await adapter.readTreeOids(treeOid);

      expect(result).toEqual({
        'only.json': 'abcdef1234567890abcdef1234567890abcdef12',
      });
    });

    it('ignores tree entries if recursive ls-tree includes them', async () => {
      const treeOid = 'aabb' + '0'.repeat(36);
      const nestedTreeOid = 'bbcc' + '0'.repeat(36);
      const blobOid = 'ccdd' + '0'.repeat(36);
      mockPlumbing.execute.mockResolvedValue(
        `040000 tree ${nestedTreeOid}\tnested\0` +
        `100644 blob ${blobOid}\tnested/item.cbor\0`
      );

      const result = await adapter.readTreeOids(treeOid);

      expect(result).toEqual({
        'nested/item.cbor': blobOid,
      });
    });

    it('preserves prototype-like path names from recursive ls-tree output', async () => {
      const treeOid = 'aabb' + '0'.repeat(36);
      const protoOid = 'beef' + '0'.repeat(36);
      const constructorOid = 'feed' + '0'.repeat(36);
      mockPlumbing.execute.mockResolvedValue(
        `100644 blob ${protoOid}\t__proto__\0` +
        `100644 blob ${constructorOid}\tconstructor\0`
      );

      const result = await adapter.readTreeOids(treeOid);

      expect(Object.hasOwn(result, '__proto__')).toBe(true);
      expect(Object.hasOwn(result, 'constructor')).toBe(true);
      expect(result['__proto__']).toBe(protoOid);
      expect(result['constructor']).toBe(constructorOid);
    });

    it('recursively preserves paths through nested trees with one git command', async () => {
      const rootTreeOid = 'aabb' + '0'.repeat(36);
      const blobOid = 'ccdd' + '0'.repeat(36);
      const rootBlobOid = 'ddcc' + '0'.repeat(36);
      mockPlumbing.execute.mockResolvedValue(
        `100644 blob ${blobOid}\tnested/item.cbor\0` +
        `100644 blob ${rootBlobOid}\troot.json\0`
      );

      const result = await adapter.readTreeOids(rootTreeOid);

      expect(result).toEqual({
        'nested/item.cbor': blobOid,
        'root.json': rootBlobOid,
      });
      expect(mockPlumbing.execute).toHaveBeenCalledTimes(1);
      expect(mockPlumbing.execute).toHaveBeenCalledWith({
        args: ['ls-tree', '-rz', rootTreeOid],
      });
      expect(mockPlumbing.executeStream).not.toHaveBeenCalled();
    });

    it('validates tree OID', async () => {
      await expect(adapter.readTreeOids('bad!'))
        .rejects.toThrow(/Invalid OID format/);

      expect(mockPlumbing.executeStream).not.toHaveBeenCalled();
      expect(mockPlumbing.execute).not.toHaveBeenCalled();
    });

    it('rejects empty OID', async () => {
      await expect(adapter.readTreeOids(''))
        .rejects.toThrow(/non-empty string/);
    });

    it('wraps missing tree errors as PersistenceError', async () => {
      const treeOid = 'aabb' + '0'.repeat(36);
      const err = (new Error(`fatal: bad object ${treeOid}`) as any);
      err.details = { code: 128, stderr: `fatal: bad object ${treeOid}` };
      mockPlumbing.execute.mockRejectedValue(err);

      await expect(adapter.readTreeOids(treeOid))
        .rejects.toMatchObject({
          code: PersistenceError.E_MISSING_OBJECT,
          message: `Missing Git object: ${treeOid}`,
        });
    });
  });

  describe('readTreeEntryOid()', () => {
    it('reads a single exact tree entry without recursive tree-map flags', async () => {
      const treeOid = 'aabb' + '0'.repeat(36);
      const frontierOid = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
      mockPlumbing.execute.mockResolvedValue(
        `100644 blob ${frontierOid}\tfrontier.cbor\0`
      );

      const result = await adapter.readTreeEntryOid(
        treeOid,
        new TreeEntryPath('frontier.cbor'),
      );

      expect(result).toBeInstanceOf(TreeEntryFound);
      if (result instanceof TreeEntryFound) {
        expect(result.oid).toBe(frontierOid);
        expect(result.path.value).toBe('frontier.cbor');
      }
      expect(mockPlumbing.execute).toHaveBeenCalledWith({
        args: ['ls-tree', '-z', treeOid, '--', 'frontier.cbor'],
      });
      expect(mockPlumbing.executeStream).not.toHaveBeenCalled();
    });

    it('returns a runtime-backed missing result for absent exact entries', async () => {
      const treeOid = 'aabb' + '0'.repeat(36);
      mockPlumbing.execute.mockResolvedValue('');

      const result = await adapter.readTreeEntryOid(treeOid, new TreeEntryPath('index'));

      expect(result).toBeInstanceOf(TreeEntryMissing);
      if (result instanceof TreeEntryMissing) {
        expect(result.path.value).toBe('index');
      }
    });

    it('validates tree OID before exact entry plumbing', async () => {
      await expect(adapter.readTreeEntryOid(
        'bad!',
        new TreeEntryPath('frontier.cbor'),
      )).rejects.toThrow(/Invalid OID format/);

      expect(mockPlumbing.execute).not.toHaveBeenCalled();
      expect(mockPlumbing.executeStream).not.toHaveBeenCalled();
    });
  });

  describe('readTreeEntryPrefix()', () => {
    it('reads bounded child prefix evidence through streaming plumbing', async () => {
      const treeOid = 'aabb' + '0'.repeat(36);
      const firstShardOid = 'beef' + '0'.repeat(36);
      mockPlumbing.execute.mockRejectedValue(new Error('full-buffer execute is forbidden for prefix probes'));
      mockPlumbing.executeStream.mockResolvedValue(
        streamFromText(`100644 blob ${firstShardOid}\tindex/first.cbor\0`)
      );

      const result = await adapter.readTreeEntryPrefix(
        treeOid,
        new TreeEntryPath('index/'),
        new TreeEntryLimit(1),
      );

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]).toBeInstanceOf(TreeEntryFound);
      expect(result.entries[0]?.oid).toBe(firstShardOid);
      expect(result.entries[0]?.path.value).toBe('index/first.cbor');
      expect(mockPlumbing.executeStream).toHaveBeenCalledWith({
        args: ['ls-tree', '-z', treeOid, '--', 'index/'],
      });
      expect(mockPlumbing.execute).not.toHaveBeenCalled();
    });

    it('stops reading prefix stream chunks when the runtime limit is reached', async () => {
      const treeOid = 'aabb' + '0'.repeat(36);
      const firstOid = 'beef' + '0'.repeat(36);
      const stream = {
        async *[Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
          yield Buffer.from(`100644 blob ${firstOid}\tindex/first.cbor\0`);
          throw new Error('prefix probe read past the requested limit');
        },
      };
      mockPlumbing.executeStream.mockResolvedValue(stream);

      const result = await adapter.readTreeEntryPrefix(
        treeOid,
        new TreeEntryPath('index/'),
        new TreeEntryLimit(1),
      );

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]?.oid).toBe(firstOid);
      expect(result.entries[0]?.path.value).toBe('index/first.cbor');
    });

    it('rejects malformed OIDs from prefix plumbing output', async () => {
      const treeOid = 'aabb' + '0'.repeat(36);
      mockPlumbing.executeStream.mockResolvedValue(
        streamFromText('100644 blob not-a-valid-oid\tindex/first.cbor\0')
      );

      await expect(adapter.readTreeEntryPrefix(
        treeOid,
        new TreeEntryPath('index/'),
        new TreeEntryLimit(1),
      )).rejects.toMatchObject({
        code: 'E_TREE_PARSE_ERROR',
      });
    });

    it('validates tree OID before prefix entry plumbing', async () => {
      await expect(adapter.readTreeEntryPrefix(
        'bad!',
        new TreeEntryPath('index/'),
        new TreeEntryLimit(1),
      )).rejects.toThrow(/Invalid OID format/);

      expect(mockPlumbing.execute).not.toHaveBeenCalled();
      expect(mockPlumbing.executeStream).not.toHaveBeenCalled();
    });
  });

  describe('readObjectType()', () => {
    it('returns blob and tree object types from cat-file output', async () => {
      const blobOid = 'a'.repeat(40);
      const treeOid = 'b'.repeat(40);
      mockPlumbing.execute
        .mockResolvedValueOnce('blob\n')
        .mockResolvedValueOnce('tree\n');

      await expect(adapter.readObjectType(blobOid)).resolves.toBe('blob');
      await expect(adapter.readObjectType(treeOid)).resolves.toBe('tree');

      expect(mockPlumbing.execute).toHaveBeenCalledWith({
        args: ['cat-file', '-t', blobOid],
      });
      expect(mockPlumbing.execute).toHaveBeenCalledWith({
        args: ['cat-file', '-t', treeOid],
      });
    });

    it('rejects unsupported git object types for content anchors', async () => {
      const oid = 'a'.repeat(40);
      mockPlumbing.execute.mockResolvedValue('commit\n');

      await expect(adapter.readObjectType(oid))
        .rejects.toMatchObject({
          code: 'E_UNSUPPORTED_CONTENT_ANCHOR_OBJECT_TYPE',
          message: `Unsupported Git object type for content anchor ${oid}: commit`,
        });
    });

    it('wraps object-type read failures with object context', async () => {
      const oid = 'a'.repeat(40);
      const err = new Error(`fatal: bad object ${oid}`);
      Object.assign(err, { details: { code: 128, stderr: `fatal: bad object ${oid}` } });
      mockPlumbing.execute.mockRejectedValue(err);

      await expect(adapter.readObjectType(oid))
        .rejects.toMatchObject({
          code: PersistenceError.E_MISSING_OBJECT,
          message: `Missing Git object: ${oid}`,
        });
    });
  });

  describe('getCommitTree()', () => {
    it('returns the trimmed tree OID for a commit', async () => {
      const commitOid = 'a'.repeat(40);
      const treeOid = 'b'.repeat(40);
      mockPlumbing.execute.mockResolvedValue(`${treeOid}\n`);

      const result = await adapter.getCommitTree(commitOid);

      expect(result).toBe(treeOid);
      expect(mockPlumbing.execute).toHaveBeenCalledWith({
        args: ['rev-parse', `${commitOid}^{tree}`],
      });
    });

    it('wraps missing commit errors as PersistenceError', async () => {
      const commitOid = 'a'.repeat(40);
      const err = (new Error(`fatal: bad object ${commitOid}`) as any);
      err.details = { code: 128, stderr: `fatal: bad object ${commitOid}` };
      mockPlumbing.execute.mockRejectedValue(err);

      await expect(adapter.getCommitTree(commitOid))
        .rejects.toMatchObject({
          code: PersistenceError.E_MISSING_OBJECT,
          message: `Missing Git object: ${commitOid}`,
        });
    });
  });

  describe('updateRef()', () => {
    it('wraps ref lock failures as PersistenceError', async () => {
      const ref = 'refs/warp/test/writers/alice';
      const oid = 'a'.repeat(40);
      const err = (new Error('fatal: permission denied') as any);
      err.details = { code: 128, stderr: 'fatal: permission denied' };
      mockPlumbing.execute.mockRejectedValue(err);

      await expect(adapter.updateRef(ref, oid))
        .rejects.toMatchObject({
          code: PersistenceError.E_REF_IO,
          message: `Ref I/O error: ${ref}`,
        });
    });
  });

  describe('compareAndSwapRef()', () => {
    it('uses the zero OID when expectedOid is null', async () => {
      const ref = 'refs/warp/test/writers/alice';
      const oid = 'a'.repeat(40);
      mockPlumbing.execute.mockResolvedValue('');

      await adapter.compareAndSwapRef(ref, oid, null);

      expect(mockPlumbing.execute).toHaveBeenCalledWith({
        args: ['update-ref', ref, oid, '0'.repeat(40)],
      });
    });

    it('validates expectedOid when provided', async () => {
      await expect(
        adapter.compareAndSwapRef('refs/warp/test/writers/alice', 'a'.repeat(40), 'bad!oid'),
      ).rejects.toThrow(/Invalid OID format/);

      expect(mockPlumbing.execute).not.toHaveBeenCalled();
    });

    it('wraps CAS failures with ref context', async () => {
      const ref = 'refs/warp/test/writers/alice';
      const oid = 'a'.repeat(40);
      const expectedOid = 'b'.repeat(40);
      const err = (new Error('fatal: cannot lock ref') as any);
      err.details = { code: 128, stderr: 'fatal: cannot lock ref' };
      mockPlumbing.execute.mockRejectedValue(err);

      await expect(adapter.compareAndSwapRef(ref, oid, expectedOid))
        .rejects.toMatchObject({
          code: PersistenceError.E_REF_IO,
          message: `Ref I/O error: ${ref}`,
        });
    });
  });

  // ── deleteRef ───────────────────────────────────────────────────────

  describe('deleteRef()', () => {
    it('calls update-ref -d with the ref', async () => {
      mockPlumbing.execute.mockResolvedValue('');

      await adapter.deleteRef('refs/warp/events/writers/alice');

      expect(mockPlumbing.execute).toHaveBeenCalledWith({
        args: ['update-ref', '-d', 'refs/warp/events/writers/alice'],
      });
    });

    it('validates ref before calling git', async () => {
      await expect(adapter.deleteRef('--malicious'))
        .rejects.toThrow(/Invalid ref/);

      expect(mockPlumbing.execute).not.toHaveBeenCalled();
    });

    it('rejects empty ref', async () => {
      await expect(adapter.deleteRef(''))
        .rejects.toThrow(/non-empty string/);
    });

    it('rejects ref with invalid characters', async () => {
      await expect(adapter.deleteRef('refs/warp;rm -rf /'))
        .rejects.toThrow(/Invalid ref format/);
    });

    it('propagates git errors as PersistenceError with E_REF_IO code', async () => {
            const err = (new Error('permission denied')) as any;
      err.exitCode = 128;
      mockPlumbing.execute.mockRejectedValue(err);

      await expect(adapter.deleteRef('refs/warp/test'))
        .rejects.toSatisfy(e =>
          e instanceof PersistenceError && e.code === PersistenceError.E_REF_IO
        );
    });
  });

  // ── ping ────────────────────────────────────────────────────────────

  describe('ping()', () => {
    it('returns ok:true with latency on success', async () => {
      mockPlumbing.execute.mockResolvedValue('true\n');

      const result = await adapter.ping();

      expect(result.ok).toBe(true);
      expect(typeof result.latencyMs).toBe('number');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(mockPlumbing.execute).toHaveBeenCalledWith({
        args: ['rev-parse', '--is-inside-work-tree'],
      });
    });

    it('returns ok:false with latency on error', async () => {
      mockPlumbing.execute.mockRejectedValue(new Error('not a git repository'));

      const result = await adapter.ping();

      expect(result.ok).toBe(false);
      expect(typeof result.latencyMs).toBe('number');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('does not throw on error', async () => {
      mockPlumbing.execute.mockRejectedValue(new Error('fatal'));

      await expect(adapter.ping()).resolves.toBeDefined();
    });
  });

  // ── isAncestor ──────────────────────────────────────────────────────

  describe('isAncestor()', () => {
    it('returns true when ancestor relationship exists (exit 0)', async () => {
      mockPlumbing.execute.mockResolvedValue('');

      const ancestorOid = 'aaaa' + '0'.repeat(36);
      const descendantOid = 'bbbb' + '0'.repeat(36);

      const result = await adapter.isAncestor(ancestorOid, descendantOid);

      expect(result).toBe(true);
      expect(mockPlumbing.execute).toHaveBeenCalledWith({
        args: ['merge-base', '--is-ancestor', ancestorOid, descendantOid],
      });
    });

    it('returns false when not an ancestor (exit code 1)', async () => {
            const err = (new Error('not ancestor')) as any;
      err.details = { code: 1 };
      mockPlumbing.execute.mockRejectedValue(err);

      const ancestorOid = 'aaaa' + '0'.repeat(36);
      const descendantOid = 'bbbb' + '0'.repeat(36);

      const result = await adapter.isAncestor(ancestorOid, descendantOid);

      expect(result).toBe(false);
    });

    it('returns false when exit code 1 via exitCode property', async () => {
            const err = (new Error('not ancestor')) as any;
      err.exitCode = 1;
      mockPlumbing.execute.mockRejectedValue(err);

      const ancestorOid = 'aaaa' + '0'.repeat(36);
      const descendantOid = 'bbbb' + '0'.repeat(36);

      const result = await adapter.isAncestor(ancestorOid, descendantOid);

      expect(result).toBe(false);
    });

    it('returns false when exit code 1 via code property', async () => {
            const err = (new Error('not ancestor')) as any;
      err.code = 1;
      mockPlumbing.execute.mockRejectedValue(err);

      const ancestorOid = 'aaaa' + '0'.repeat(36);
      const descendantOid = 'bbbb' + '0'.repeat(36);

      const result = await adapter.isAncestor(ancestorOid, descendantOid);

      expect(result).toBe(false);
    });

    it('re-throws unexpected errors (non exit-code-1)', async () => {
            const err = (new Error('repository corrupt')) as any;
      err.details = { code: 128 };
      mockPlumbing.execute.mockRejectedValue(err);

      const ancestorOid = 'aaaa' + '0'.repeat(36);
      const descendantOid = 'bbbb' + '0'.repeat(36);

      await expect(adapter.isAncestor(ancestorOid, descendantOid))
        .rejects.toThrow('repository corrupt');
    });

    it('re-throws errors with no exit code', async () => {
      const err = new Error('unexpected failure');
      mockPlumbing.execute.mockRejectedValue(err);

      const ancestorOid = 'aaaa' + '0'.repeat(36);
      const descendantOid = 'bbbb' + '0'.repeat(36);

      await expect(adapter.isAncestor(ancestorOid, descendantOid))
        .rejects.toThrow('unexpected failure');
    });

    it('validates potentialAncestor OID', async () => {
      await expect(adapter.isAncestor('bad!', 'aaaa' + '0'.repeat(36)))
        .rejects.toThrow(/Invalid OID format/);

      expect(mockPlumbing.execute).not.toHaveBeenCalled();
    });

    it('validates descendant OID', async () => {
      await expect(adapter.isAncestor('aaaa' + '0'.repeat(36), 'bad!'))
        .rejects.toThrow(/Invalid OID format/);

      expect(mockPlumbing.execute).not.toHaveBeenCalled();
    });

    it('rejects empty ancestor OID', async () => {
      await expect(adapter.isAncestor('', 'aaaa' + '0'.repeat(36)))
        .rejects.toThrow(/non-empty string/);
    });

    it('rejects empty descendant OID', async () => {
      await expect(adapter.isAncestor('aaaa' + '0'.repeat(36), ''))
        .rejects.toThrow(/non-empty string/);
    });
  });
});

// ── Conformance suite against a real Git repo ─────────────────────────────

describeAdapterConformance('GitGraphAdapter', async () => {
  const repo = await createGitRepo('conformance');
  return { adapter: repo.persistence, cleanup: repo.cleanup };
});
