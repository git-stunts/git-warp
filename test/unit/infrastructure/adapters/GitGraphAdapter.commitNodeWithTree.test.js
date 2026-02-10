import { describe, it, expect, vi, beforeEach } from 'vitest';
import GitGraphAdapter from '../../../../src/infrastructure/adapters/GitGraphAdapter.js';

describe('GitGraphAdapter', () => {
  describe('commitNodeWithTree()', () => {
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

    it('creates commit with custom tree (not empty tree)', async () => {
      const customTreeOid = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0';
      const commitSha = 'f1e2d3c4b5a6f7e8d9c0b1a2f3e4d5c6b7a8f9e0';
      mockPlumbing.execute.mockResolvedValue(`${commitSha}\n`);

      const result = await adapter.commitNodeWithTree({
        treeOid: customTreeOid,
        message: 'Test commit with custom tree',
      });

      expect(result).toBe(commitSha);
      expect(mockPlumbing.execute).toHaveBeenCalledWith({
        args: ['commit-tree', customTreeOid, '-m', 'Test commit with custom tree'],
      });
      // Verify we're NOT using the empty tree
      const args = mockPlumbing.execute.mock.calls[0][0].args;
      expect(args[1]).toBe(customTreeOid);
      expect(args[1]).not.toBe(mockPlumbing.emptyTree);
    });

    it('supports no parents (orphan commit)', async () => {
      const treeOid = 'aaaa1111bbbb2222cccc3333dddd4444eeee5555';
      mockPlumbing.execute.mockResolvedValue('abc123\n');

      await adapter.commitNodeWithTree({
        treeOid,
        parents: [],
        message: 'Orphan commit',
      });

      expect(mockPlumbing.execute).toHaveBeenCalledWith({
        args: ['commit-tree', treeOid, '-m', 'Orphan commit'],
      });
      // Verify no -p flags are present
      const args = mockPlumbing.execute.mock.calls[0][0].args;
      expect(args).not.toContain('-p');
    });

    it('supports single parent', async () => {
      const treeOid = 'aaaa1111bbbb2222cccc3333dddd4444eeee5555';
      const parentSha = 'bbbb1234567890abcdef1234567890abcdef1234';
      mockPlumbing.execute.mockResolvedValue('abc123\n');

      await adapter.commitNodeWithTree({
        treeOid,
        parents: [parentSha],
        message: 'Single parent commit',
      });

      expect(mockPlumbing.execute).toHaveBeenCalledWith({
        args: ['commit-tree', treeOid, '-p', parentSha, '-m', 'Single parent commit'],
      });
    });

    it('supports multiple parents', async () => {
      const treeOid = 'aaaa1111bbbb2222cccc3333dddd4444eeee5555';
      const parent1 = '1111111111111111111111111111111111111111';
      const parent2 = '2222222222222222222222222222222222222222';
      const parent3 = '3333333333333333333333333333333333333333';
      mockPlumbing.execute.mockResolvedValue('abc123456\n');

      await adapter.commitNodeWithTree({
        treeOid,
        parents: [parent1, parent2, parent3],
        message: 'Merge commit with multiple parents',
      });

      expect(mockPlumbing.execute).toHaveBeenCalledWith({
        args: [
          'commit-tree', treeOid,
          '-p', parent1,
          '-p', parent2,
          '-p', parent3,
          '-m', 'Merge commit with multiple parents',
        ],
      });
    });

    it('supports GPG signing when sign=true', async () => {
      const treeOid = 'aaaa1111bbbb2222cccc3333dddd4444eeee5555';
      mockPlumbing.execute.mockResolvedValue('signedcommit123\n');

      await adapter.commitNodeWithTree({
        treeOid,
        message: 'Signed commit',
        sign: true,
      });

      expect(mockPlumbing.execute).toHaveBeenCalledWith({
        args: ['commit-tree', treeOid, '-S', '-m', 'Signed commit'],
      });
    });

    it('does not include -S flag when sign=false', async () => {
      const treeOid = 'aaaa1111bbbb2222cccc3333dddd4444eeee5555';
      mockPlumbing.execute.mockResolvedValue('unsignedcommit123\n');

      await adapter.commitNodeWithTree({
        treeOid,
        message: 'Unsigned commit',
        sign: false,
      });

      const args = mockPlumbing.execute.mock.calls[0][0].args;
      expect(args).not.toContain('-S');
    });

    it('combines parents and signing correctly', async () => {
      const treeOid = 'aaaa1111bbbb2222cccc3333dddd4444eeee5555';
      const parent = 'cccc1234567890abcdef1234567890abcdef1234';
      mockPlumbing.execute.mockResolvedValue('abc123456\n');

      await adapter.commitNodeWithTree({
        treeOid,
        parents: [parent],
        message: 'Signed commit with parent',
        sign: true,
      });

      expect(mockPlumbing.execute).toHaveBeenCalledWith({
        args: ['commit-tree', treeOid, '-p', parent, '-S', '-m', 'Signed commit with parent'],
      });
    });

    it('validates treeOid', async () => {
      await expect(adapter.commitNodeWithTree({
        treeOid: 'invalid!oid',
        message: 'Test',
      })).rejects.toThrow(/Invalid OID format/);

      expect(mockPlumbing.execute).not.toHaveBeenCalled();
    });

    it('rejects empty treeOid', async () => {
      await expect(adapter.commitNodeWithTree({
        treeOid: '',
        message: 'Test',
      })).rejects.toThrow(/non-empty string/);

      expect(mockPlumbing.execute).not.toHaveBeenCalled();
    });

    it('rejects too-long treeOid', async () => {
      const longOid = 'a'.repeat(65);
      await expect(adapter.commitNodeWithTree({
        treeOid: longOid,
        message: 'Test',
      })).rejects.toThrow(/OID too long/);

      expect(mockPlumbing.execute).not.toHaveBeenCalled();
    });

    it('validates parent OIDs', async () => {
      const validTreeOid = 'aaaa1111bbbb2222cccc3333dddd4444eeee5555';

      await expect(adapter.commitNodeWithTree({
        treeOid: validTreeOid,
        parents: ['invalid!parent'],
        message: 'Test',
      })).rejects.toThrow(/Invalid OID format/);

      expect(mockPlumbing.execute).not.toHaveBeenCalled();
    });

    it('validates all parent OIDs', async () => {
      const validTreeOid = 'aaaa1111bbbb2222cccc3333dddd4444eeee5555';
      const validParent = 'bbbb1111cccc2222dddd3333eeee4444ffff5555';

      await expect(adapter.commitNodeWithTree({
        treeOid: validTreeOid,
        parents: [validParent, 'invalid!second'],
        message: 'Test',
      })).rejects.toThrow(/Invalid OID format/);

      expect(mockPlumbing.execute).not.toHaveBeenCalled();
    });

    it('returns trimmed SHA', async () => {
      const treeOid = 'aaaa1111bbbb2222cccc3333dddd4444eeee5555';
      mockPlumbing.execute.mockResolvedValue('  abc123def456  \n');

      const result = await adapter.commitNodeWithTree({
        treeOid,
        message: 'Test',
      });

      expect(result).toBe('abc123def456');
    });

    it('uses retry logic via _executeWithRetry', async () => {
      const treeOid = 'aaaa1111bbbb2222cccc3333dddd4444eeee5555';

      // First call fails with transient error, second succeeds
      mockPlumbing.execute
        .mockRejectedValueOnce(new Error('cannot lock ref'))
        .mockResolvedValueOnce('abc123\n');

      const result = await adapter.commitNodeWithTree({
        treeOid,
        message: 'Test with retry',
      });

      expect(result).toBe('abc123');
      expect(mockPlumbing.execute).toHaveBeenCalledTimes(2);
    });

    it('accepts short SHA for treeOid (4+ hex chars)', async () => {
      mockPlumbing.execute.mockResolvedValue('commit123\n');

      await adapter.commitNodeWithTree({
        treeOid: 'abcd',
        message: 'Short tree OID',
      });

      expect(mockPlumbing.execute).toHaveBeenCalledWith({
        args: ['commit-tree', 'abcd', '-m', 'Short tree OID'],
      });
    });

    it('accepts full 40-char SHA for treeOid', async () => {
      const fullSha = 'a'.repeat(40);
      mockPlumbing.execute.mockResolvedValue('commit123\n');

      await adapter.commitNodeWithTree({
        treeOid: fullSha,
        message: 'Full tree OID',
      });

      expect(mockPlumbing.execute).toHaveBeenCalledWith({
        args: ['commit-tree', fullSha, '-m', 'Full tree OID'],
      });
    });

    it('defaults parents to empty array when not provided', async () => {
      const treeOid = 'aaaa1111bbbb2222cccc3333dddd4444eeee5555';
      mockPlumbing.execute.mockResolvedValue('abc123\n');

      await adapter.commitNodeWithTree({
        treeOid,
        message: 'No parents specified',
      });

      // Should work without parents option, no -p flags
      const args = mockPlumbing.execute.mock.calls[0][0].args;
      expect(args).not.toContain('-p');
    });

    it('defaults sign to false when not provided', async () => {
      const treeOid = 'aaaa1111bbbb2222cccc3333dddd4444eeee5555';
      mockPlumbing.execute.mockResolvedValue('abc123\n');

      await adapter.commitNodeWithTree({
        treeOid,
        message: 'No sign specified',
      });

      // Should work without sign option, no -S flag
      const args = mockPlumbing.execute.mock.calls[0][0].args;
      expect(args).not.toContain('-S');
    });
  });
});
