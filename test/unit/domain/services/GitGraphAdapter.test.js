import { describe, it, expect, vi, beforeEach } from 'vitest';
import GitGraphAdapter from '../../../../src/infrastructure/adapters/GitGraphAdapter.js';

describe('GitGraphAdapter', () => {
  describe('getNodeInfo()', () => {
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

    it('parses full commit metadata correctly', async () => {
      // Format: SHA\x00author <email>\x00ISO date\x00parents\x00message
      mockPlumbing.execute.mockResolvedValue(
        'abc123def456789012345678901234567890abcd\x00Alice <alice@example.com>\x002026-01-29T10:30:00-05:00\x00parent1 parent2\x00My commit message'
      );

      const result = await adapter.getNodeInfo('abc123def456789012345678901234567890abcd');

      expect(result).toEqual({
        sha: 'abc123def456789012345678901234567890abcd',
        author: 'Alice <alice@example.com>',
        date: '2026-01-29T10:30:00-05:00',
        parents: ['parent1', 'parent2'],
        message: 'My commit message',
      });
    });

    it('handles root commit with no parents', async () => {
      mockPlumbing.execute.mockResolvedValue(
        'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0\x00Bob <bob@example.com>\x002026-01-01T00:00:00+00:00\x00\x00Initial commit'
      );

      const result = await adapter.getNodeInfo('a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0');

      expect(result.parents).toEqual([]);
      expect(result.message).toBe('Initial commit');
    });

    it('handles single parent commit', async () => {
      mockPlumbing.execute.mockResolvedValue(
        'aaaa1234\x00Author\x00Date\x00singleparent\x00Message'
      );

      const result = await adapter.getNodeInfo('aaaa1234');

      expect(result.parents).toEqual(['singleparent']);
    });

    it('handles multi-line commit message', async () => {
      const multiLineMessage = 'Subject line\n\nBody paragraph 1.\n\nBody paragraph 2.';
      mockPlumbing.execute.mockResolvedValue(
        `bbbb5678\x00Author\x00Date\x00parent1\x00${multiLineMessage}`
      );

      const result = await adapter.getNodeInfo('bbbb5678');

      expect(result.message).toBe(multiLineMessage);
    });

    it('trims whitespace from SHA, author, and date but not message', async () => {
      mockPlumbing.execute.mockResolvedValue(
        '  cccc9012  \x00  Author Name <author@example.com>  \x00  2026-01-29T10:30:00-05:00  \x00parent1\x00  Message with spaces  '
      );

      const result = await adapter.getNodeInfo('cccc9012');

      expect(result.sha).toBe('cccc9012');
      expect(result.author).toBe('Author Name <author@example.com>');
      expect(result.date).toBe('2026-01-29T10:30:00-05:00');
      expect(result.message).toBe('  Message with spaces  ');
    });

    it('calls git show with correct format', async () => {
      mockPlumbing.execute.mockResolvedValue('sha\x00a\x00d\x00\x00m');

      await adapter.getNodeInfo('abc123');

      expect(mockPlumbing.execute).toHaveBeenCalledWith({
        args: ['show', '-s', '--format=%H%x00%an <%ae>%x00%aI%x00%P%x00%B', 'abc123'],
      });
    });

    it('validates OID before calling git', async () => {
      await expect(adapter.getNodeInfo('invalid!sha'))
        .rejects.toThrow(/Invalid OID format/);

      expect(mockPlumbing.execute).not.toHaveBeenCalled();
    });

    it('throws on malformed output', async () => {
      mockPlumbing.execute.mockResolvedValue('not-enough-parts');

      await expect(adapter.getNodeInfo('abc123'))
        .rejects.toThrow(/Invalid commit format/);
    });
  });

  describe('logNodesStream NUL byte stripping', () => {
    /** @type {any} */
    let mockPlumbing;
    /** @type {any} */
    let adapter;
    /** @type {any} */
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
      const formatArg = capturedArgs.find((/** @type {any} */ arg) => arg.startsWith('--format='));
      expect(formatArg).toBe('--format=%H%n%B');
      expect(formatArg).not.toContain('\x00');
    });

    it('strips embedded NUL bytes from format string', async () => {
      const formatWithEmbeddedNul = '%H\x00%n%B';

      await adapter.logNodesStream({ ref: 'HEAD', format: formatWithEmbeddedNul });

      expect(mockPlumbing.executeStream).toHaveBeenCalledTimes(1);
      const formatArg = capturedArgs.find((/** @type {any} */ arg) => arg.startsWith('--format='));
      expect(formatArg).toBe('--format=%H%n%B');
      expect(formatArg).not.toContain('\x00');
    });

    it('strips multiple NUL bytes from format string', async () => {
      const formatWithMultipleNuls = '\x00%H\x00%n\x00%B\x00';

      await adapter.logNodesStream({ ref: 'HEAD', format: formatWithMultipleNuls });

      expect(mockPlumbing.executeStream).toHaveBeenCalledTimes(1);
      const formatArg = capturedArgs.find((/** @type {any} */ arg) => arg.startsWith('--format='));
      expect(formatArg).toBe('--format=%H%n%B');
      expect(formatArg).not.toContain('\x00');
    });

    it('passes format through unchanged when no NUL bytes present', async () => {
      const cleanFormat = '%H%n%P%n%s%n%b';

      await adapter.logNodesStream({ ref: 'HEAD', format: cleanFormat });

      expect(mockPlumbing.executeStream).toHaveBeenCalledTimes(1);
      const formatArg = capturedArgs.find((/** @type {any} */ arg) => arg.startsWith('--format='));
      expect(formatArg).toBe('--format=%H%n%P%n%s%n%b');
    });

    it('handles empty format string without error', async () => {
      await adapter.logNodesStream({ ref: 'HEAD', format: '' });

      expect(mockPlumbing.executeStream).toHaveBeenCalledTimes(1);
      // Empty format should not add --format argument
      const formatArg = capturedArgs.find((/** @type {any} */ arg) => arg.startsWith('--format='));
      expect(formatArg).toBeUndefined();
    });

    it('handles format with only NUL bytes', async () => {
      const onlyNuls = '\x00\x00\x00';

      await adapter.logNodesStream({ ref: 'HEAD', format: onlyNuls });

      expect(mockPlumbing.executeStream).toHaveBeenCalledTimes(1);
      // After stripping NULs, format becomes empty string but --format= is still added
      // since the original format was truthy. The key is no NUL bytes in args.
      const formatArg = capturedArgs.find((/** @type {any} */ arg) => arg.startsWith('--format='));
      expect(formatArg).toBe('--format=');
      expect(formatArg).not.toContain('\x00');
    });

    it('works correctly without format parameter', async () => {
      await adapter.logNodesStream({ ref: 'HEAD' });

      expect(mockPlumbing.executeStream).toHaveBeenCalledTimes(1);
      const formatArg = capturedArgs.find((/** @type {any} */ arg) => arg.startsWith('--format='));
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

  describe('nodeExists()', () => {
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

    it('returns true when node exists', async () => {
      mockPlumbing.execute.mockResolvedValue('');

      const exists = await adapter.nodeExists('abc123def456789012345678901234567890abcd');

      expect(exists).toBe(true);
      expect(mockPlumbing.execute).toHaveBeenCalledWith({
        args: ['cat-file', '-e', 'abc123def456789012345678901234567890abcd'],
      });
    });

    it('returns false when node does not exist', async () => {
      const err = /** @type {any} */ (new Error('fatal: Not a valid object name'));
      err.details = { code: 1 };
      mockPlumbing.execute.mockRejectedValue(err);

      const exists = await adapter.nodeExists('abc123def456789012345678901234567890abcd');

      expect(exists).toBe(false);
    });

    it('rethrows non-missing-object errors', async () => {
      mockPlumbing.execute.mockRejectedValue(new Error('some git error'));

      await expect(adapter.nodeExists('abc123'))
        .rejects.toThrow('some git error');
    });

    it('validates OID before calling git', async () => {
      await expect(adapter.nodeExists('invalid!sha'))
        .rejects.toThrow(/Invalid OID format/);

      expect(mockPlumbing.execute).not.toHaveBeenCalled();
    });

    it('rejects empty OID', async () => {
      await expect(adapter.nodeExists(''))
        .rejects.toThrow(/non-empty string/);
    });

    it('accepts short SHA (4+ hex chars)', async () => {
      mockPlumbing.execute.mockResolvedValue('');

      const exists = await adapter.nodeExists('abcd');

      expect(exists).toBe(true);
      expect(mockPlumbing.execute).toHaveBeenCalledWith({
        args: ['cat-file', '-e', 'abcd'],
      });
    });

    it('accepts full 40-char SHA', async () => {
      const fullSha = 'a'.repeat(40);
      mockPlumbing.execute.mockResolvedValue('');

      const exists = await adapter.nodeExists(fullSha);

      expect(exists).toBe(true);
    });

    it('uses cat-file -e for efficient existence check', async () => {
      mockPlumbing.execute.mockResolvedValue('');

      await adapter.nodeExists('abc123');

      // Verify we use cat-file -e (not cat-file -t or other)
      const args = mockPlumbing.execute.mock.calls[0][0].args;
      expect(args).toEqual(['cat-file', '-e', 'abc123']);
    });
  });

  describe('countNodes()', () => {
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

    it('returns count from git rev-list --count', async () => {
      mockPlumbing.execute.mockResolvedValue('42\n');

      const count = await adapter.countNodes('HEAD');

      expect(count).toBe(42);
      expect(mockPlumbing.execute).toHaveBeenCalledWith({
        args: ['rev-list', '--count', 'HEAD'],
      });
    });

    it('returns count for branch ref', async () => {
      mockPlumbing.execute.mockResolvedValue('1000\n');

      const count = await adapter.countNodes('main');

      expect(count).toBe(1000);
      expect(mockPlumbing.execute).toHaveBeenCalledWith({
        args: ['rev-list', '--count', 'main'],
      });
    });

    it('returns count for SHA ref', async () => {
      mockPlumbing.execute.mockResolvedValue('5\n');

      const count = await adapter.countNodes('abc123def456789012345678901234567890abcd');

      expect(count).toBe(5);
    });

    it('returns 1 for single root commit', async () => {
      mockPlumbing.execute.mockResolvedValue('1\n');

      const count = await adapter.countNodes('HEAD');

      expect(count).toBe(1);
    });

    it('handles large counts', async () => {
      mockPlumbing.execute.mockResolvedValue('1000000\n');

      const count = await adapter.countNodes('HEAD');

      expect(count).toBe(1000000);
    });

    it('validates ref before calling git', async () => {
      await expect(adapter.countNodes('--malicious'))
        .rejects.toThrow(/Invalid ref/);

      expect(mockPlumbing.execute).not.toHaveBeenCalled();
    });

    it('rejects empty ref', async () => {
      await expect(adapter.countNodes(''))
        .rejects.toThrow(/non-empty string/);
    });

    it('rejects ref with invalid characters', async () => {
      await expect(adapter.countNodes('ref;rm -rf'))
        .rejects.toThrow(/Invalid ref format/);
    });

    it('trims whitespace from output', async () => {
      mockPlumbing.execute.mockResolvedValue('  123  \n');

      const count = await adapter.countNodes('HEAD');

      expect(count).toBe(123);
    });
  });

  describe('configGet()', () => {
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

    it('returns config value when set', async () => {
      mockPlumbing.execute.mockResolvedValue('stored-value\n');

      const result = await adapter.configGet('warp.writerId.events');

      expect(result).toBe('stored-value');
      expect(mockPlumbing.execute).toHaveBeenCalledWith({
        args: ['config', '--get', 'warp.writerId.events'],
      });
    });

    it('returns null when config key not found', async () => {
      const err = /** @type {any} */ (new Error('exit code 1'));
      err.exitCode = 1;
      mockPlumbing.execute.mockRejectedValue(err);

      const result = await adapter.configGet('nonexistent.key');

      expect(result).toBeNull();
    });

    it('returns null when config key not found (message pattern)', async () => {
      const err = new Error('error: exit code 1');
      mockPlumbing.execute.mockRejectedValue(err);

      const result = await adapter.configGet('nonexistent.key');

      expect(result).toBeNull();
    });

    it('validates config key before calling git', async () => {
      await expect(adapter.configGet('--malicious'))
        .rejects.toThrow(/Invalid config key/);

      expect(mockPlumbing.execute).not.toHaveBeenCalled();
    });

    it('rejects empty config key', async () => {
      await expect(adapter.configGet(''))
        .rejects.toThrow(/non-empty string/);
    });

    it('rejects too long config key', async () => {
      const longKey = 'a'.repeat(257);

      await expect(adapter.configGet(longKey))
        .rejects.toThrow(/Config key too long/);
    });

    it('preserves empty config value', async () => {
      mockPlumbing.execute.mockResolvedValue('');

      const result = await adapter.configGet('some.key');

      expect(result).toBe('');
    });

    it('accepts valid config key formats', async () => {
      mockPlumbing.execute.mockResolvedValue('value\n');

      await adapter.configGet('warp.writerId.my-graph');
      await adapter.configGet('section.subsection.key');
      await adapter.configGet('simple.key');

      expect(mockPlumbing.execute).toHaveBeenCalledTimes(3);
    });
  });

  describe('configSet()', () => {
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

    it('sets config value', async () => {
      mockPlumbing.execute.mockResolvedValue('');

      await adapter.configSet('warp.writerId.events', 'w_abc123');

      expect(mockPlumbing.execute).toHaveBeenCalledWith({
        args: ['config', 'warp.writerId.events', 'w_abc123'],
      });
    });

    it('validates config key before calling git', async () => {
      await expect(adapter.configSet('--malicious', 'value'))
        .rejects.toThrow(/Invalid config key/);

      expect(mockPlumbing.execute).not.toHaveBeenCalled();
    });

    it('rejects empty config key', async () => {
      await expect(adapter.configSet('', 'value'))
        .rejects.toThrow(/non-empty string/);
    });

    it('rejects non-string value', async () => {
      await expect(adapter.configSet('some.key', /** @type {any} */ (123)))
        .rejects.toThrow(/Config value must be a string/);

      await expect(adapter.configSet('some.key', /** @type {any} */ (null)))
        .rejects.toThrow(/Config value must be a string/);
    });

    it('accepts empty string value', async () => {
      mockPlumbing.execute.mockResolvedValue('');

      await adapter.configSet('some.key', '');

      expect(mockPlumbing.execute).toHaveBeenCalledWith({
        args: ['config', 'some.key', ''],
      });
    });

    it('propagates git errors', async () => {
      mockPlumbing.execute.mockRejectedValue(new Error('permission denied'));

      await expect(adapter.configSet('some.key', 'value'))
        .rejects.toThrow('permission denied');
    });
  });
});
