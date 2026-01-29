import { describe, it, expect, vi, beforeEach } from 'vitest';
import GitGraphAdapter from '../../../../src/infrastructure/adapters/GitGraphAdapter.js';

describe('GitGraphAdapter', () => {
  describe('logNodesStream NUL byte stripping', () => {
    let mockPlumbing;
    let adapter;
    let capturedArgs;

    beforeEach(() => {
      capturedArgs = null;
      mockPlumbing = {
        emptyTree: '4b825dc642cb6eb9a060e54bf8d69288fbee4904',
        executeStream: vi.fn().mockImplementation(async ({ args }) => {
          capturedArgs = args;
          // Return a mock stream
          return {
            collect: vi.fn().mockResolvedValue('')
          };
        })
      };
      adapter = new GitGraphAdapter({ plumbing: mockPlumbing });
    });

    it('strips trailing NUL byte from format string', async () => {
      const formatWithTrailingNul = '%H%n%B\x00';

      await adapter.logNodesStream({ ref: 'HEAD', format: formatWithTrailingNul });

      expect(mockPlumbing.executeStream).toHaveBeenCalledTimes(1);
      const formatArg = capturedArgs.find(arg => arg.startsWith('--format='));
      expect(formatArg).toBe('--format=%H%n%B');
      expect(formatArg).not.toContain('\x00');
    });

    it('strips embedded NUL bytes from format string', async () => {
      const formatWithEmbeddedNul = '%H\x00%n%B';

      await adapter.logNodesStream({ ref: 'HEAD', format: formatWithEmbeddedNul });

      expect(mockPlumbing.executeStream).toHaveBeenCalledTimes(1);
      const formatArg = capturedArgs.find(arg => arg.startsWith('--format='));
      expect(formatArg).toBe('--format=%H%n%B');
      expect(formatArg).not.toContain('\x00');
    });

    it('strips multiple NUL bytes from format string', async () => {
      const formatWithMultipleNuls = '\x00%H\x00%n\x00%B\x00';

      await adapter.logNodesStream({ ref: 'HEAD', format: formatWithMultipleNuls });

      expect(mockPlumbing.executeStream).toHaveBeenCalledTimes(1);
      const formatArg = capturedArgs.find(arg => arg.startsWith('--format='));
      expect(formatArg).toBe('--format=%H%n%B');
      expect(formatArg).not.toContain('\x00');
    });

    it('passes format through unchanged when no NUL bytes present', async () => {
      const cleanFormat = '%H%n%P%n%s%n%b';

      await adapter.logNodesStream({ ref: 'HEAD', format: cleanFormat });

      expect(mockPlumbing.executeStream).toHaveBeenCalledTimes(1);
      const formatArg = capturedArgs.find(arg => arg.startsWith('--format='));
      expect(formatArg).toBe('--format=%H%n%P%n%s%n%b');
    });

    it('handles empty format string without error', async () => {
      await adapter.logNodesStream({ ref: 'HEAD', format: '' });

      expect(mockPlumbing.executeStream).toHaveBeenCalledTimes(1);
      // Empty format should not add --format argument
      const formatArg = capturedArgs.find(arg => arg.startsWith('--format='));
      expect(formatArg).toBeUndefined();
    });

    it('handles format with only NUL bytes', async () => {
      const onlyNuls = '\x00\x00\x00';

      await adapter.logNodesStream({ ref: 'HEAD', format: onlyNuls });

      expect(mockPlumbing.executeStream).toHaveBeenCalledTimes(1);
      // After stripping NULs, format becomes empty string but --format= is still added
      // since the original format was truthy. The key is no NUL bytes in args.
      const formatArg = capturedArgs.find(arg => arg.startsWith('--format='));
      expect(formatArg).toBe('--format=');
      expect(formatArg).not.toContain('\x00');
    });

    it('works correctly without format parameter', async () => {
      await adapter.logNodesStream({ ref: 'HEAD' });

      expect(mockPlumbing.executeStream).toHaveBeenCalledTimes(1);
      const formatArg = capturedArgs.find(arg => arg.startsWith('--format='));
      expect(formatArg).toBeUndefined();
      // Verify other args are correct
      expect(capturedArgs).toContain('log');
      expect(capturedArgs).toContain('-z');
      expect(capturedArgs).toContain('HEAD');
    });

    it('includes -z flag for NUL-terminated output', async () => {
      await adapter.logNodesStream({ ref: 'main', format: '%H' });

      expect(capturedArgs).toContain('-z');
    });

    it('no args contain NUL bytes after processing', async () => {
      const adversarialFormat = '%H\x00%n\x00%B\x00';

      await adapter.logNodesStream({ ref: 'HEAD', format: adversarialFormat });

      for (const arg of capturedArgs) {
        expect(arg).not.toContain('\x00');
      }
    });
  });
});
