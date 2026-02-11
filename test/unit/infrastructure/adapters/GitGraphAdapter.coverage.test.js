import { describe, it, expect, vi, beforeEach } from 'vitest';
import GitGraphAdapter from '../../../../src/infrastructure/adapters/GitGraphAdapter.js';
import { createGitRepo } from '../../../helpers/warpGraphTestUtils.js';
import { describeAdapterConformance } from './AdapterConformance.js';

/** @type {any} */
let mockPlumbing;
/** @type {any} */
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
      const hasFormat = /** @type {string[]} */ (args).some((a) => a.startsWith('--format='));
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
  });

  // ── readTree ────────────────────────────────────────────────────────

  describe('readTree()', () => {
    it('reads each blob content for entries in the tree', async () => {
      const treeOid = 'aabb' + '0'.repeat(36);
      // ls-tree output: NUL-separated records
      mockPlumbing.execute.mockResolvedValue(
        `100644 blob deadbeef01234567890123456789012345678901\tfile_a.json\0` +
        `100644 blob cafebabe01234567890123456789012345678901\tfile_b.json\0`
      );

      const mockStream = {
        collect: vi.fn(),
      };
      // First call returns content for file_a, second for file_b
      let callCount = 0;
      mockPlumbing.executeStream.mockImplementation(async () => {
        callCount += 1;
        return {
          collect: vi.fn().mockResolvedValue(
            Buffer.from(callCount === 1 ? 'content_a' : 'content_b')
          ),
        };
      });

      const result = await adapter.readTree(treeOid);

      expect(result['file_a.json']).toEqual(Buffer.from('content_a'));
      expect(result['file_b.json']).toEqual(Buffer.from('content_b'));
      expect(mockPlumbing.executeStream).toHaveBeenCalledTimes(2);
    });

    it('returns empty map for empty tree', async () => {
      const treeOid = 'aabb' + '0'.repeat(36);
      mockPlumbing.execute.mockResolvedValue('');

      const result = await adapter.readTree(treeOid);

      expect(result).toEqual({});
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
        args: ['ls-tree', '-r', '-z', treeOid],
      });
    });

    it('returns empty map when tree has no entries', async () => {
      const treeOid = 'aabb' + '0'.repeat(36);
      mockPlumbing.execute.mockResolvedValue('');

      const result = await adapter.readTreeOids(treeOid);

      expect(result).toEqual({});
    });

    it('skips records without a tab separator', async () => {
      const treeOid = 'aabb' + '0'.repeat(36);
      mockPlumbing.execute.mockResolvedValue(
        '100644 blob deadbeefdeadbeefdeadbeefdeadbeefdeadbeef\tvalid.json\0' +
        'malformed-no-tab\0'
      );

      const result = await adapter.readTreeOids(treeOid);

      expect(Object.keys(result)).toEqual(['valid.json']);
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

    it('validates tree OID', async () => {
      await expect(adapter.readTreeOids('bad!'))
        .rejects.toThrow(/Invalid OID format/);

      expect(mockPlumbing.execute).not.toHaveBeenCalled();
    });

    it('rejects empty OID', async () => {
      await expect(adapter.readTreeOids(''))
        .rejects.toThrow(/non-empty string/);
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

    it('propagates git errors', async () => {
      mockPlumbing.execute.mockRejectedValue(new Error('permission denied'));

      await expect(adapter.deleteRef('refs/warp/test'))
        .rejects.toThrow('permission denied');
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
      /** @type {any} */
      const err = new Error('not ancestor');
      err.details = { code: 1 };
      mockPlumbing.execute.mockRejectedValue(err);

      const ancestorOid = 'aaaa' + '0'.repeat(36);
      const descendantOid = 'bbbb' + '0'.repeat(36);

      const result = await adapter.isAncestor(ancestorOid, descendantOid);

      expect(result).toBe(false);
    });

    it('returns false when exit code 1 via exitCode property', async () => {
      /** @type {any} */
      const err = new Error('not ancestor');
      err.exitCode = 1;
      mockPlumbing.execute.mockRejectedValue(err);

      const ancestorOid = 'aaaa' + '0'.repeat(36);
      const descendantOid = 'bbbb' + '0'.repeat(36);

      const result = await adapter.isAncestor(ancestorOid, descendantOid);

      expect(result).toBe(false);
    });

    it('returns false when exit code 1 via code property', async () => {
      /** @type {any} */
      const err = new Error('not ancestor');
      err.code = 1;
      mockPlumbing.execute.mockRejectedValue(err);

      const ancestorOid = 'aaaa' + '0'.repeat(36);
      const descendantOid = 'bbbb' + '0'.repeat(36);

      const result = await adapter.isAncestor(ancestorOid, descendantOid);

      expect(result).toBe(false);
    });

    it('re-throws unexpected errors (non exit-code-1)', async () => {
      /** @type {any} */
      const err = new Error('repository corrupt');
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
