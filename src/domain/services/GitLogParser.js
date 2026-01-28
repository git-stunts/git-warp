import GraphNode from '../entities/GraphNode.js';

/**
 * NUL byte (0x00) - Delimits commit records in git log output.
 *
 * Git commit messages cannot contain NUL bytes - git rejects them at commit time.
 * This makes NUL a perfectly safe delimiter that cannot appear in any field,
 * eliminating the possibility of message injection attacks.
 *
 * The git log format produces records in this exact structure:
 *
 * ```
 * <SHA>\n
 * <author>\n
 * <date>\n
 * <parents (space-separated)>\n
 * <message body (may contain newlines)>\x00
 * ```
 *
 * Fields within each record are separated by newlines. The first 4 lines are
 * fixed fields (SHA, author, date, parents), and all remaining content up to
 * the NUL terminator is the message body.
 *
 * @see https://git-scm.com/docs/git-log (see -z option documentation)
 * @const {string}
 */
export const RECORD_SEPARATOR = '\x00';

/**
 * Parser for git log output streams.
 *
 * Handles UTF-8 decoding, record splitting, and node instantiation as separate
 * concerns. Designed as an injectable dependency for GraphService to enable
 * testing and alternative implementations.
 *
 * **Log Format Contract**: Each record is NUL-terminated and contains fields
 * separated by newlines:
 * 1. SHA (40 hex chars)
 * 2. Author name
 * 3. Date string
 * 4. Parent SHAs (space-separated, empty string for root commits)
 * 5. Message body (may span multiple lines, everything until NUL terminator)
 *
 * **Why NUL delimiter?** Git commit messages cannot contain NUL bytes - git
 * rejects them at commit time. This makes NUL a perfectly safe record delimiter
 * that eliminates parsing ambiguity, unlike 0x1E which can theoretically appear
 * in message content.
 *
 * @example
 * // Basic usage
 * const parser = new GitLogParser();
 * for await (const node of parser.parse(stream)) {
 *   console.log(node.sha, node.message);
 * }
 *
 * @example
 * // Inject into GraphService for testing
 * const mockParser = { parse: async function*() { yield mockNode; } };
 * const service = new GraphService({ persistence, parser: mockParser });
 */
export default class GitLogParser {
  /**
   * Parses a stream of git log output and yields GraphNode instances.
   *
   * Handles:
   * - UTF-8 sequences split across chunk boundaries
   * - Records terminated by NUL bytes (RECORD_SEPARATOR)
   * - Streaming without loading entire history into memory
   *
   * @param {AsyncIterable<Buffer|string>} stream - The git log output stream.
   *   May yield Buffer or string chunks.
   * @yields {GraphNode} Parsed graph nodes. Invalid records are silently skipped.
   *
   * @example
   * const stream = persistence.logNodesStream({ ref: 'main', limit: 100, format });
   * for await (const node of parser.parse(stream)) {
   *   console.log(node.sha);
   * }
   */
  async *parse(stream) {
    let buffer = '';
    const decoder = new TextDecoder('utf-8', { fatal: false });

    for await (const chunk of stream) {
      // Use stream: true to handle UTF-8 sequences split across chunks
      buffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });

      let splitIndex;
      // Split on NUL byte - the record terminator
      while ((splitIndex = buffer.indexOf(RECORD_SEPARATOR)) !== -1) {
        const block = buffer.slice(0, splitIndex);
        buffer = buffer.slice(splitIndex + RECORD_SEPARATOR.length);

        const node = this.parseNode(block);
        if (node) {
          yield node;
        }
      }
    }

    // Flush any remaining bytes in the decoder
    buffer += decoder.decode();

    // Process final block (may not have trailing separator)
    if (buffer.trim()) {
      const node = this.parseNode(buffer);
      if (node) {
        yield node;
      }
    }
  }

  /**
   * Parses a single record block into a GraphNode.
   *
   * Expected format (fields separated by newlines):
   * - Line 0: SHA (required, non-empty)
   * - Line 1: Author name
   * - Line 2: Date string
   * - Line 3: Parent SHAs (space-separated, may be empty for root commits)
   * - Lines 4+: Message body (preserved exactly, not trimmed)
   *
   * The block should not include the trailing NUL terminator - that is stripped
   * by the parse() method before calling parseNode().
   *
   * @param {string} block - Raw block text (without trailing NUL terminator)
   * @returns {GraphNode|null} Parsed node, or null if the block is malformed
   *   or has an empty message (GraphNode requires non-empty message)
   *
   * @example
   * const block = 'abc123\nAuthor\n2026-01-28\nparent1 parent2\nCommit message';
   * const node = parser.parseNode(block);
   * // node.sha === 'abc123'
   * // node.parents === ['parent1', 'parent2']
   */
  parseNode(block) {
    const lines = block.split('\n');
    // Need at least 4 lines: SHA, author, date, parents
    // Message (lines 4+) may be empty
    if (lines.length < 4) {
      return null;
    }

    const sha = lines[0];
    if (!sha) {
      return null;
    }

    const author = lines[1];
    const date = lines[2];
    const parents = lines[3] ? lines[3].split(' ').filter(Boolean) : [];
    // Preserve message exactly as-is (may be empty, may have leading/trailing whitespace)
    const message = lines.slice(4).join('\n');

    // GraphNode requires non-empty message, return null for empty
    if (!message) {
      return null;
    }

    return new GraphNode({ sha, author, date, message, parents });
  }
}
