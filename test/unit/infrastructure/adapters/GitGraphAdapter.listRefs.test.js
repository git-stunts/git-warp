import { describe, it, expect, vi, beforeEach } from 'vitest';
import GitGraphAdapter from '../../../../src/infrastructure/adapters/GitGraphAdapter.js';

describe('GitGraphAdapter', () => {
  describe('listRefs()', () => {
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

    it('returns parsed refs from git output', async () => {
      mockPlumbing.execute.mockResolvedValue(
        'refs/warp/events/writers/writer1\nrefs/warp/events/writers/writer2\nrefs/warp/events/writers/writer3\n'
      );

      const refs = await adapter.listRefs('refs/warp/events/writers/');

      expect(refs).toEqual([
        'refs/warp/events/writers/writer1',
        'refs/warp/events/writers/writer2',
        'refs/warp/events/writers/writer3',
      ]);
      expect(mockPlumbing.execute).toHaveBeenCalledWith({
        args: ['for-each-ref', '--format=%(refname)', 'refs/warp/events/writers/'],
      });
    });

    it('returns empty array when output is empty', async () => {
      mockPlumbing.execute.mockResolvedValue('');

      const refs = await adapter.listRefs('refs/warp/events/writers/');

      expect(refs).toEqual([]);
    });

    it('filters empty lines from output', async () => {
      mockPlumbing.execute.mockResolvedValue(
        'refs/warp/events/writers/writer1\n\n\nrefs/warp/events/writers/writer2\n\n'
      );

      const refs = await adapter.listRefs('refs/warp/events/writers/');

      expect(refs).toEqual([
        'refs/warp/events/writers/writer1',
        'refs/warp/events/writers/writer2',
      ]);
    });

    it('filters lines with only whitespace', async () => {
      mockPlumbing.execute.mockResolvedValue(
        'refs/warp/events/writers/writer1\n   \n\t\nrefs/warp/events/writers/writer2\n'
      );

      const refs = await adapter.listRefs('refs/warp/events/writers/');

      expect(refs).toEqual([
        'refs/warp/events/writers/writer1',
        'refs/warp/events/writers/writer2',
      ]);
    });

    it('throws on invalid prefix starting with dash', async () => {
      await expect(adapter.listRefs('-malicious'))
        .rejects.toThrow(/Invalid ref/);

      expect(mockPlumbing.execute).not.toHaveBeenCalled();
    });

    it('throws on invalid prefix starting with double dash', async () => {
      await expect(adapter.listRefs('--format=evil'))
        .rejects.toThrow(/Invalid ref/);

      expect(mockPlumbing.execute).not.toHaveBeenCalled();
    });

    it('throws on empty prefix', async () => {
      await expect(adapter.listRefs(''))
        .rejects.toThrow(/non-empty string/);

      expect(mockPlumbing.execute).not.toHaveBeenCalled();
    });

    it('throws on prefix with invalid characters', async () => {
      await expect(adapter.listRefs('refs/test;rm -rf /'))
        .rejects.toThrow(/Invalid ref format/);

      expect(mockPlumbing.execute).not.toHaveBeenCalled();
    });

    it('retries on transient errors', async () => {
      // First call fails with transient error, second succeeds
      mockPlumbing.execute
        .mockRejectedValueOnce(new Error('cannot lock ref'))
        .mockResolvedValueOnce('refs/warp/events/writers/writer1\n');

      const refs = await adapter.listRefs('refs/warp/events/writers/');

      expect(refs).toEqual(['refs/warp/events/writers/writer1']);
      expect(mockPlumbing.execute).toHaveBeenCalledTimes(2);
    });

    it('handles single ref output', async () => {
      mockPlumbing.execute.mockResolvedValue('refs/warp/index\n');

      const refs = await adapter.listRefs('refs/warp/');

      expect(refs).toEqual(['refs/warp/index']);
    });

    it('handles output without trailing newline', async () => {
      mockPlumbing.execute.mockResolvedValue('refs/warp/events/writers/writer1');

      const refs = await adapter.listRefs('refs/warp/events/writers/');

      expect(refs).toEqual(['refs/warp/events/writers/writer1']);
    });

    it('calls git for-each-ref with correct arguments', async () => {
      mockPlumbing.execute.mockResolvedValue('');

      await adapter.listRefs('refs/heads/');

      expect(mockPlumbing.execute).toHaveBeenCalledWith({
        args: ['for-each-ref', '--format=%(refname)', 'refs/heads/'],
      });
    });
  });
});
