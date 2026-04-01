import GraphNode from '../entities/GraphNode.js';
import { checkAborted } from '../utils/cancellation.js';
import { concatBytes, textEncode, textDecode } from '../utils/bytes.js';

/**
 * Parses a parent-SHAs line into an array.
 * @param {string | undefined} line
 * @returns {string[]}
 */
function parseParentLine(line) {
  if (line === undefined || line === '') {
    return [];
  }
  return line.split(' ').filter(Boolean);
}

/**
 * Converts a chunk to Uint8Array.
 * @param {Uint8Array|string} chunk
 * @returns {Uint8Array}
 */
function toBytes(chunk) {
  if (typeof chunk === 'string') {
    return textEncode(chunk);
  }
  if (chunk instanceof Uint8Array) {
    return chunk;
  }
  return Uint8Array.from(chunk);
}

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
 * concerns. Designed as an injectable dependency for WarpRuntime to enable
 * testing and alternative implementations.
 *
 * **Binary-First Processing**: The parser works directly with binary data for
 * performance. Uint8Array.indexOf(0) scans bytes without UTF-8 decoding
 * overhead, and byte-level comparison is faster than character-level.
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
 * // Inject into WarpRuntime for testing
 * const mockParser = { parse: async function*() { yield mockNode; } };
 * const graph = new WarpRuntime({ persistence, parser: mockParser });
 */
export default class GitLogParser {
  /**
   * Parses a stream of git log output and yields GraphNode instances.
   *
   * **Binary-first processing for performance**:
   * - Accepts Uint8Array or string chunks
   * - Finds NUL bytes (0x00) directly in binary using Uint8Array.indexOf(0)
   * - UTF-8 decoding only happens for complete records, not during scanning
   *
   * Handles:
   * - UTF-8 sequences split across chunk boundaries (via binary accumulation)
   * - Records terminated by NUL bytes (0x00)
   * - Streaming without loading entire history into memory
   * - Backwards compatibility with string chunks
   * - Cancellation via AbortSignal
   *
   * @param {AsyncIterable<Uint8Array|string>} stream - The git log output stream.
   *   May yield Uint8Array or string chunks.
   * @param {{ signal?: AbortSignal }} [options] - Parse options
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
    /** @type {Uint8Array} */
    let buffer = new Uint8Array(0); // Binary buffer accumulator

    for await (const chunk of stream) {
      checkAborted(signal, 'GitLogParser.parse');
      const chunkBytes = toBytes(chunk);
      buffer = concatBytes(buffer, chunkBytes);
      const result = this._drainBuffer(buffer, signal);
      buffer = result.remaining;
      yield* result.nodes;
    }

    // Process any remaining data (final record without trailing NUL)
    const trailing = this._parseTrailing(buffer);
    if (trailing) {
      yield trailing;
    }
  }

  /**
   * Parses any remaining bytes after the stream ends (final record without trailing NUL).
   * @param {Uint8Array} buffer
   * @returns {GraphNode | null}
   * @private
   */
  _parseTrailing(buffer) {
    if (buffer.length === 0) {
      return null;
    }
    const block = textDecode(buffer);
    if (block.length === 0) {
      return null;
    }
    return this.parseNode(block);
  }

  /**
   * Extracts complete NUL-delimited records from the binary buffer.
   *
   * @param {Uint8Array} buffer - Accumulated binary data
   * @param {AbortSignal} [signal] - Optional cancellation signal
   * @returns {{ nodes: GraphNode[], remaining: Uint8Array }} Parsed nodes and leftover bytes
   * @private
   */
  _drainBuffer(buffer, signal) {
    /** @type {GraphNode[]} */
    const nodes = [];
    let buf = buffer;
    let nullIndex;
    while ((nullIndex = buf.indexOf(0)) !== -1) {
      checkAborted(signal, 'GitLogParser.parse');
      const recordBytes = buf.subarray(0, nullIndex);
      buf = buf.subarray(nullIndex + 1);
      const block = textDecode(recordBytes);
      const node = this.parseNode(block);
      if (node) {
        nodes.push(node);
      }
    }
    return { nodes, remaining: buf };
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
    if (lines.length < 4) {
      return null;
    }

    const sha = lines[0];
    if (sha === undefined || sha === '') {
      return null;
    }

    const message = lines.slice(4).join('\n');
    if (message.length === 0) {
      return null;
    }

    return new GraphNode({
      sha,
      author: lines[1],
      date: lines[2],
      message,
      parents: parseParentLine(lines[3]),
    });
  }
}
