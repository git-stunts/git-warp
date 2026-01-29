import GraphNode from '../entities/GraphNode.js';
import { checkAborted } from '../utils/cancellation.js';

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
 * **Binary-First Processing**: The parser works directly with binary data for
 * performance. Buffer.indexOf(0) is faster than string indexOf('\0') because:
 * - No UTF-8 decoding overhead during scanning
 * - Native C++ implementation in Node.js Buffer
 * - Byte-level comparison vs character-level
 *
 * UTF-8 decoding only happens once per complete record, not during scanning.
 * This is especially beneficial for large commit histories where most of the
 * data is being scanned to find record boundaries.
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
   * **Binary-first processing for performance**:
   * - Accepts Buffer, Uint8Array, or string chunks
   * - Finds NUL bytes (0x00) directly in binary using Buffer.indexOf(0)
   * - Buffer.indexOf(0) is faster than string indexOf('\0') - native C++ vs JS
   * - UTF-8 decoding only happens for complete records, not during scanning
   *
   * Handles:
   * - UTF-8 sequences split across chunk boundaries (via binary accumulation)
   * - Records terminated by NUL bytes (0x00)
   * - Streaming without loading entire history into memory
   * - Backwards compatibility with string chunks
   * - Cancellation via AbortSignal
   *
   * @param {AsyncIterable<Buffer|Uint8Array|string>} stream - The git log output stream.
   *   May yield Buffer, Uint8Array, or string chunks.
   * @param {Object} [options] - Parse options
   * @param {AbortSignal} [options.signal] - Optional abort signal for cancellation
   * @yields {GraphNode} Parsed graph nodes. Invalid records are silently skipped.
   * @throws {OperationAbortedError} If signal is aborted during parsing
   *
   * @example
   * const stream = persistence.logNodesStream({ ref: 'main', limit: 100, format });
   * for await (const node of parser.parse(stream)) {
   *   console.log(node.sha);
   * }
   *
   * @example
   * // With cancellation support
   * const controller = new AbortController();
   * for await (const node of parser.parse(stream, { signal: controller.signal })) {
   *   console.log(node.sha);
   * }
   */
  async *parse(stream, { signal } = {}) {
    let buffer = Buffer.alloc(0); // Binary buffer accumulator

    for await (const chunk of stream) {
      checkAborted(signal, 'GitLogParser.parse');

      // Convert string chunks to Buffer, keep Buffer chunks as-is
      const chunkBuffer =
        typeof chunk === 'string'
          ? Buffer.from(chunk, 'utf-8')
          : Buffer.isBuffer(chunk)
            ? chunk
            : Buffer.from(chunk); // Uint8Array

      // Append to accumulator
      buffer = Buffer.concat([buffer, chunkBuffer]);

      // Find NUL bytes (0x00) in binary - faster than string indexOf
      let nullIndex;
      while ((nullIndex = buffer.indexOf(0)) !== -1) {
        checkAborted(signal, 'GitLogParser.parse');

        // Extract record bytes and decode to string
        const recordBytes = buffer.subarray(0, nullIndex);
        buffer = buffer.subarray(nullIndex + 1);

        // Only decode UTF-8 for complete records
        const block = recordBytes.toString('utf-8');
        const node = this.parseNode(block);
        if (node) {
          yield node;
        }
      }
    }

    // Process any remaining data (final record without trailing NUL)
    if (buffer.length > 0) {
      const block = buffer.toString('utf-8');
      if (block) {
        const node = this.parseNode(block);
        if (node) {
          yield node;
        }
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
