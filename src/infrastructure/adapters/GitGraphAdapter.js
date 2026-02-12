/**
 * @fileoverview Git-backed persistence adapter for WARP graph storage.
 *
 * This module provides the concrete implementation of {@link GraphPersistencePort}
 * that translates high-level graph operations into Git plumbing commands. It serves
 * as the primary adapter in the hexagonal architecture, bridging the domain layer
 * to the underlying Git storage substrate.
 *
 * ## Architecture Role
 *
 * In WARP's hexagonal architecture, GitGraphAdapter sits at the infrastructure layer:
 *
 * ```
 *   Domain (WarpGraph, JoinReducer)
 *            ↓
 *   Ports (GraphPersistencePort - abstract interface)
 *            ↓
 *   Adapters (GitGraphAdapter - this module)
 *            ↓
 *   External (@git-stunts/plumbing → Git)
 * ```
 *
 * All graph data is stored as Git commits pointing to the well-known empty tree
 * (`4b825dc642cb6eb9a060e54bf8d69288fbee4904`). This design means no files appear
 * in the working directory, yet all data inherits Git's content-addressing,
 * cryptographic integrity, and distributed replication capabilities.
 *
 * ## Multi-Writer Concurrency
 *
 * WARP supports multiple concurrent writers without coordination. Each writer
 * maintains an independent patch chain under `refs/warp/<graph>/writers/<writerId>`.
 * This adapter handles the inevitable lock contention via automatic retry with
 * exponential backoff for transient Git errors (ref locks, I/O timeouts).
 *
 * ## Security
 *
 * All user-supplied inputs (refs, OIDs, config keys) are validated before being
 * passed to Git commands to prevent command injection attacks. See the private
 * `_validate*` methods for validation rules.
 *
 * @module infrastructure/adapters/GitGraphAdapter
 * @see {@link GraphPersistencePort} for the abstract interface contract
 * @see {@link https://git-scm.com/book/en/v2/Git-Internals-Plumbing-and-Porcelain} for Git plumbing concepts
 */

import { retry } from '@git-stunts/alfred';
import GraphPersistencePort from '../../ports/GraphPersistencePort.js';
import { validateOid, validateRef, validateLimit, validateConfigKey } from './adapterValidation.js';

/**
 * Transient Git errors that are safe to retry automatically.
 *
 * These patterns represent temporary conditions that resolve on their own:
 *
 * - **"cannot lock ref"**: Another process holds the ref lock (common in multi-writer
 *   scenarios where multiple writers attempt concurrent commits). Git uses file-based
 *   locking (`<ref>.lock` files), so concurrent writes naturally contend.
 *
 * - **"resource temporarily unavailable"**: OS-level I/O contention, typically from
 *   file descriptor limits or NFS lock issues on network filesystems.
 *
 * - **"connection timed out"**: Network issues when the Git repository is accessed
 *   over a network protocol (SSH, HTTPS) or when using NFS-mounted storage.
 *
 * Non-transient errors (e.g., "repository not found", "permission denied") are NOT
 * retried and propagate immediately to the caller.
 *
 * @type {string[]}
 * @private
 */
const TRANSIENT_ERROR_PATTERNS = [
  'cannot lock ref',
  'resource temporarily unavailable',
  'connection timed out',
];

/**
 * @typedef {Error & { details?: { stderr?: string, code?: number }, exitCode?: number, code?: number }} GitError
 */

/**
 * Determines if an error is transient and safe to retry.
 * @param {GitError} error - The error to check
 * @returns {boolean} True if the error is transient
 */
function isTransientError(error) {
  const message = (error.message || '').toLowerCase();
  const stderr = (error.details?.stderr || '').toLowerCase();
  const searchText = `${message} ${stderr}`;
  return TRANSIENT_ERROR_PATTERNS.some(pattern => searchText.includes(pattern));
}

/**
 * Default retry options for git operations.
 * Uses exponential backoff with decorrelated jitter.
 * @type {import('@git-stunts/alfred').RetryOptions}
 */
const DEFAULT_RETRY_OPTIONS = {
  retries: 3,
  delay: 100,
  maxDelay: 2000,
  backoff: 'exponential',
  jitter: 'decorrelated',
  shouldRetry: isTransientError,
};

/**
 * Extracts the exit code from a Git command error.
 * Checks multiple possible locations where the exit code may be stored.
 * @param {GitError} err - The error object
 * @returns {number|undefined} The exit code if found
 */
function getExitCode(err) {
  return err?.details?.code ?? err?.exitCode ?? err?.code;
}

/**
 * Checks whether a Git ref exists without resolving it.
 * @param {function(Object): Promise<string>} execute - The git command executor function
 * @param {string} ref - The ref to check (e.g., 'refs/warp/events/writers/alice')
 * @returns {Promise<boolean>} True if the ref exists, false otherwise
 * @throws {Error} If the git command fails for reasons other than a missing ref
 */
async function refExists(execute, ref) {
  try {
    await execute({ args: ['show-ref', '--verify', '--quiet', ref] });
    return true;
  } catch (/** @type {*} */ err) { // TODO(ts-cleanup): type error
    if (getExitCode(err) === 1) {
      return false;
    }
    throw err;
  }
}

/**
 * Concrete implementation of {@link GraphPersistencePort} using Git plumbing commands.
 *
 * This adapter translates abstract graph persistence operations into Git plumbing
 * commands (`commit-tree`, `hash-object`, `update-ref`, `cat-file`, etc.). It serves
 * as the bridge between WARP's domain logic and Git's content-addressed storage.
 *
 * Implements all five focused ports via the composite GraphPersistencePort:
 * - {@link CommitPort} — commit creation, reading, logging, counting, ping
 * - {@link BlobPort} — blob read/write
 * - {@link TreePort} — tree read/write, emptyTree getter
 * - {@link RefPort} — ref update/read/delete
 * - {@link ConfigPort} — git config get/set
 *
 * ## Retry Strategy
 *
 * All write operations use automatic retry with exponential backoff to handle
 * transient Git errors. This is essential for multi-writer scenarios where
 * concurrent writers may contend for ref locks:
 *
 * - **Retries**: 3 attempts by default
 * - **Initial delay**: 100ms
 * - **Max delay**: 2000ms (2 seconds)
 * - **Backoff**: Exponential with decorrelated jitter to prevent thundering herd
 * - **Retry condition**: Only transient errors (see {@link TRANSIENT_ERROR_PATTERNS})
 *
 * Custom retry options can be provided via the constructor to tune behavior
 * for specific deployment environments (e.g., longer delays for NFS storage).
 *
 * ## Thread Safety
 *
 * This adapter is safe for concurrent use from multiple async contexts within
 * the same Node.js process. Git's file-based locking provides external
 * synchronization, and the retry logic handles lock contention gracefully.
 *
 * @extends GraphPersistencePort
 * @see {@link GraphPersistencePort} for the abstract interface contract
 * @see {@link DEFAULT_RETRY_OPTIONS} for retry configuration details
 *
 * @example
 * // Basic usage with default retry options
 * import Plumbing from '@git-stunts/plumbing';
 * import GitGraphAdapter from './GitGraphAdapter.js';
 *
 * const plumbing = new Plumbing({ cwd: '/path/to/repo' });
 * const adapter = new GitGraphAdapter({ plumbing });
 *
 * // Create a commit pointing to the empty tree
 * const sha = await adapter.commitNode({ message: 'patch data...' });
 *
 * @example
 * // Custom retry options for high-latency storage
 * const adapter = new GitGraphAdapter({
 *   plumbing,
 *   retryOptions: {
 *     retries: 5,
 *     delay: 200,
 *     maxDelay: 5000,
 *   }
 * });
 */
export default class GitGraphAdapter extends GraphPersistencePort {
  /**
   * Creates a new GitGraphAdapter instance.
   *
   * @param {{ plumbing: *, retryOptions?: Object }} options - Configuration options
   *
   * @throws {Error} If plumbing is not provided
   *
   * @example
   * const adapter = new GitGraphAdapter({
   *   plumbing: new Plumbing({ cwd: '/repo' }),
   *   retryOptions: { retries: 5, delay: 200 }
   * });
   */
  constructor({ plumbing, retryOptions = {} }) {
    super();
    if (!plumbing) {
      throw new Error('plumbing is required');
    }
    this.plumbing = plumbing;
    this._retryOptions = { ...DEFAULT_RETRY_OPTIONS, ...retryOptions };
  }

  /**
   * Executes a git command with retry logic.
   * @param {Object} options - Options to pass to plumbing.execute
   * @returns {Promise<string>} Command output
   * @private
   */
  async _executeWithRetry(options) {
    return await retry(() => this.plumbing.execute(options), this._retryOptions);
  }

  /**
   * The well-known SHA for Git's empty tree object.
   * @type {string}
   * @readonly
   */
  get emptyTree() {
    return this.plumbing.emptyTree;
  }

  /**
   * Creates a commit pointing to the empty tree.
   * @param {Object} options
   * @param {string} options.message - The commit message (typically CBOR-encoded patch data)
   * @param {string[]} [options.parents=[]] - Parent commit SHAs
   * @param {boolean} [options.sign=false] - Whether to GPG-sign the commit
   * @returns {Promise<string>} The SHA of the created commit
   * @throws {Error} If any parent OID is invalid
   */
  async commitNode({ message, parents = [], sign = false }) {
    for (const p of parents) {
      this._validateOid(p);
    }
    const parentArgs = parents.flatMap(p => ['-p', p]);
    const signArgs = sign ? ['-S'] : [];
    const args = ['commit-tree', this.emptyTree, ...parentArgs, ...signArgs, '-m', message];

    const oid = await this._executeWithRetry({ args });
    return oid.trim();
  }

  /**
   * Creates a commit pointing to a custom tree (not the empty tree).
   * Used for WARP patch commits that have attachment trees.
   * @param {Object} options
   * @param {string} options.treeOid - The tree OID to point to
   * @param {string[]} [options.parents=[]] - Parent commit SHAs
   * @param {string} options.message - Commit message
   * @param {boolean} [options.sign=false] - Whether to GPG sign
   * @returns {Promise<string>} The created commit SHA
   */
  async commitNodeWithTree({ treeOid, parents = [], message, sign = false }) {
    this._validateOid(treeOid);
    for (const p of parents) {
      this._validateOid(p);
    }
    const parentArgs = parents.flatMap(p => ['-p', p]);
    const signArgs = sign ? ['-S'] : [];
    const args = ['commit-tree', treeOid, ...parentArgs, ...signArgs, '-m', message];

    const oid = await this._executeWithRetry({ args });
    return oid.trim();
  }

  /**
   * Retrieves the raw commit message for a given SHA.
   * @param {string} sha - The commit SHA to read
   * @returns {Promise<string>} The raw commit message content
   * @throws {Error} If the SHA is invalid
   */
  async showNode(sha) {
    this._validateOid(sha);
    return await this._executeWithRetry({ args: ['show', '-s', '--format=%B', sha] });
  }

  /**
   * Gets full commit metadata for a node.
   * @param {string} sha - The commit SHA to retrieve
   * @returns {Promise<{sha: string, message: string, author: string, date: string, parents: string[]}>}
   *   Full commit metadata including SHA, message, author, date, and parent SHAs
   * @throws {Error} If the SHA is invalid or the commit format is malformed
   */
  async getNodeInfo(sha) {
    this._validateOid(sha);
    // Format: SHA, author, date, parents (space-separated), then message
    // Using %x00 to separate fields for reliable parsing
    const format = '%H%x00%an <%ae>%x00%aI%x00%P%x00%B';
    const output = await this._executeWithRetry({
      args: ['show', '-s', `--format=${format}`, sha]
    });

    const parts = output.split('\x00');
    if (parts.length < 5) {
      throw new Error(`Invalid commit format for SHA ${sha}`);
    }

    const [commitSha, author, date, parentsStr, ...messageParts] = parts;
    const message = messageParts.join('\x00'); // In case message contained NUL (shouldn't happen)
    const parents = parentsStr ? parentsStr.split(' ').filter(p => p) : [];

    return {
      sha: commitSha.trim(),
      message,
      author: author.trim(),
      date: date.trim(),
      parents,
    };
  }

  /**
   * Returns raw git log output for a ref.
   * @param {Object} options
   * @param {string} options.ref - The Git ref to log from
   * @param {number} [options.limit=50] - Maximum number of commits to return
   * @param {string} [options.format] - Custom format string for git log
   * @returns {Promise<string>} The raw log output
   * @throws {Error} If the ref is invalid or the limit is out of range
   */
  async logNodes({ ref, limit = 50, format }) {
    this._validateRef(ref);
    this._validateLimit(limit);
    const args = ['log', `-${limit}`];
    if (format) {
      args.push(`--format=${format}`);
    }
    args.push(ref);
    return await this._executeWithRetry({ args });
  }

  /**
   * Streams git log output for the given ref.
   * Uses the -z flag to produce NUL-terminated output, which:
   * - Ensures reliable parsing of commits with special characters in messages
   * - Ignores the i18n.logOutputEncoding config setting for consistent output
   * @param {Object} options
   * @param {string} options.ref - The ref to log from
   * @param {number} [options.limit=1000000] - Maximum number of commits to return
   * @param {string} [options.format] - Custom format string for git log
   * @returns {Promise<import('node:stream').Readable>} A readable stream of git log output (NUL-terminated records)
   * @throws {Error} If the ref is invalid or the limit is out of range
   */
  async logNodesStream({ ref, limit = 1000000, format }) {
    this._validateRef(ref);
    this._validateLimit(limit);
    // -z flag ensures NUL-terminated output and ignores i18n.logOutputEncoding config
    const args = ['log', '-z', `-${limit}`];
    if (format) {
      // Strip NUL bytes from format - git -z flag handles NUL termination automatically
      // Node.js child_process rejects args containing null bytes
      // eslint-disable-next-line no-control-regex
      const cleanFormat = format.replace(/\x00/g, '');
      args.push(`--format=${cleanFormat}`);
    }
    args.push(ref);
    return await this.plumbing.executeStream({ args });
  }

  /**
   * Validates that a ref is safe to use in git commands.
   * Delegates to shared validation in adapterValidation.js.
   * @param {string} ref - The ref to validate
   * @throws {Error} If ref contains invalid characters, is too long, or starts with -/--
   * @private
   */
  _validateRef(ref) {
    validateRef(ref);
  }

  /**
   * Writes content as a Git blob and returns its OID.
   * @param {Buffer|string} content - The blob content to write
   * @returns {Promise<string>} The Git OID of the created blob
   */
  async writeBlob(content) {
    const oid = await this._executeWithRetry({
      args: ['hash-object', '-w', '--stdin'],
      input: content,
    });
    return oid.trim();
  }

  /**
   * Creates a Git tree from mktree-formatted entries.
   * @param {string[]} entries - Lines in git mktree format (e.g., "100644 blob <oid>\t<path>")
   * @returns {Promise<string>} The Git OID of the created tree
   */
  async writeTree(entries) {
    const oid = await this._executeWithRetry({
      args: ['mktree'],
      input: `${entries.join('\n')}\n`,
    });
    return oid.trim();
  }

  /**
   * Reads a tree and returns a map of path to content.
   * Processes blobs sequentially to avoid spawning too many concurrent reads.
   * @param {string} treeOid - The tree OID to read
   * @returns {Promise<Record<string, Buffer>>} Map of file path to blob content
   */
  async readTree(treeOid) {
    const oids = await this.readTreeOids(treeOid);
    /** @type {Record<string, Buffer>} */
    const files = {};
    // Process sequentially to avoid spawning thousands of concurrent readBlob calls
    for (const [path, oid] of Object.entries(oids)) {
      files[path] = await this.readBlob(oid);
    }
    return files;
  }

  /**
   * Reads a tree and returns a map of path to blob OID.
   * Useful for lazy-loading shards without reading all blob contents.
   * @param {string} treeOid - The tree OID to read
   * @returns {Promise<Record<string, string>>} Map of file path to blob OID
   * @throws {Error} If the tree OID is invalid
   */
  async readTreeOids(treeOid) {
    this._validateOid(treeOid);
    const output = await this._executeWithRetry({
      args: ['ls-tree', '-r', '-z', treeOid]
    });

    /** @type {Record<string, string>} */
    const oids = {};
    // NUL-separated records: "mode type oid\tpath\0"
    const records = output.split('\0');
    for (const record of records) {
      if (!record) {
        continue;
      }
      // Format: "mode type oid\tpath"
      const tabIndex = record.indexOf('\t');
      if (tabIndex === -1) {
        continue;
      }
      const meta = record.slice(0, tabIndex);
      const path = record.slice(tabIndex + 1);
      const [, , oid] = meta.split(' ');
      oids[path] = oid;
    }
    return oids;
  }

  /**
   * Reads the content of a Git blob.
   * @param {string} oid - The blob OID to read
   * @returns {Promise<Buffer>} The blob content
   * @throws {Error} If the OID is invalid
   */
  async readBlob(oid) {
    this._validateOid(oid);
    const stream = await this.plumbing.executeStream({
      args: ['cat-file', 'blob', oid]
    });
    return await stream.collect({ asString: false });
  }

  /**
   * Updates a ref to point to an OID.
   * @param {string} ref - The ref name (e.g., 'refs/warp/events/writers/alice')
   * @param {string} oid - The OID to point to
   * @returns {Promise<void>}
   * @throws {Error} If the ref or OID is invalid
   */
  async updateRef(ref, oid) {
    this._validateRef(ref);
    this._validateOid(oid);
    await this._executeWithRetry({
      args: ['update-ref', ref, oid]
    });
  }

  /**
   * Reads the OID a ref points to.
   * @param {string} ref - The ref name
   * @returns {Promise<string|null>} The OID, or null if the ref does not exist
   * @throws {Error} If the ref format is invalid
   */
  async readRef(ref) {
    this._validateRef(ref);
    const exists = await refExists(this._executeWithRetry.bind(this), ref);
    if (!exists) {
      return null;
    }
    try {
      const oid = await this._executeWithRetry({
        args: ['rev-parse', ref]
      });
      return oid.trim();
    } catch (/** @type {*} */ err) { // TODO(ts-cleanup): type error
      if (getExitCode(err) === 1) {
        return null;
      }
      throw err;
    }
  }

  /**
   * Atomically updates a ref using compare-and-swap semantics.
   *
   * Uses `git update-ref ref newOid expectedOid` which is atomic CAS.
   * Fails if the ref does not currently point to expectedOid.
   *
   * @param {string} ref - The ref name
   * @param {string} newOid - The new OID to set
   * @param {string|null} expectedOid - The expected current OID, or null if the ref must not exist
   * @returns {Promise<void>}
   * @throws {Error} If the ref does not match the expected value (CAS mismatch)
   */
  async compareAndSwapRef(ref, newOid, expectedOid) {
    this._validateRef(ref);
    this._validateOid(newOid);
    // null means "ref must not exist" → use zero OID
    const oldArg = expectedOid || '0'.repeat(newOid.length);
    if (expectedOid) {
      this._validateOid(expectedOid);
    }
    // Direct call — CAS failures are semantically expected and must NOT be retried.
    await this.plumbing.execute({
      args: ['update-ref', ref, newOid, oldArg],
    });
  }

  /**
   * Deletes a ref.
   * @param {string} ref - The ref name to delete
   * @returns {Promise<void>}
   * @throws {Error} If the ref format is invalid
   */
  async deleteRef(ref) {
    this._validateRef(ref);
    await this._executeWithRetry({
      args: ['update-ref', '-d', ref]
    });
  }

  /**
   * Validates that an OID is safe to use in git commands.
   * Delegates to shared validation in adapterValidation.js.
   * @param {string} oid - The OID to validate
   * @throws {Error} If OID is invalid
   * @private
   */
  _validateOid(oid) {
    validateOid(oid);
  }

  /**
   * Validates that a limit is a safe positive integer.
   * Delegates to shared validation in adapterValidation.js.
   * @param {number} limit - The limit to validate
   * @throws {Error} If limit is invalid
   * @private
   */
  _validateLimit(limit) {
    validateLimit(limit);
  }

  /**
   * Checks if a node (commit) exists in the repository.
   * Uses `git cat-file -e` for efficient existence checking without loading content.
   * @param {string} sha - The commit SHA to check
   * @returns {Promise<boolean>} True if the node exists, false otherwise
   * @throws {Error} If the SHA format is invalid
   */
  async nodeExists(sha) {
    this._validateOid(sha);
    try {
      await this._executeWithRetry({ args: ['cat-file', '-e', sha] });
      return true;
    } catch (/** @type {*} */ err) { // TODO(ts-cleanup): type error
      if (getExitCode(err) === 1) {
        return false;
      }
      throw err;
    }
  }

  /**
   * Lists refs matching a prefix.
   * @param {string} prefix - The ref prefix to match (e.g., 'refs/warp/events/writers/')
   * @returns {Promise<string[]>} Array of matching ref paths
   * @throws {Error} If the prefix is invalid
   */
  async listRefs(prefix) {
    this._validateRef(prefix);
    const output = await this._executeWithRetry({
      args: ['for-each-ref', '--format=%(refname)', prefix]
    });
    // Parse output - one ref per line, filter empty lines
    return output.split('\n').filter(line => line.trim());
  }

  /**
   * Pings the repository to verify accessibility.
   * Uses `git rev-parse --is-inside-work-tree` as a lightweight check.
   *
   * Note: latencyMs includes retry overhead if retries occur, so it may not
   * reflect single-trip repository latency in degraded conditions.
   *
   * @returns {Promise<{ok: boolean, latencyMs: number}>} Health check result with latency
   */
  async ping() {
    const start = Date.now();
    try {
      await this._executeWithRetry({ args: ['rev-parse', '--is-inside-work-tree'] });
      const latencyMs = Date.now() - start;
      return { ok: true, latencyMs };
    } catch {
      const latencyMs = Date.now() - start;
      return { ok: false, latencyMs };
    }
  }

  /**
   * Counts nodes reachable from a ref without loading them into memory.
   * Uses `git rev-list --count` for O(1) memory efficiency.
   * @param {string} ref - Git ref to count from (e.g., 'HEAD', 'main', SHA)
   * @returns {Promise<number>} The count of reachable nodes
   * @throws {Error} If the ref is invalid
   */
  async countNodes(ref) {
    this._validateRef(ref);
    const output = await this._executeWithRetry({
      args: ['rev-list', '--count', ref]
    });
    return parseInt(output.trim(), 10);
  }

  /**
   * Checks if one commit is an ancestor of another.
   * Uses `git merge-base --is-ancestor` for efficient ancestry testing.
   *
   * @param {string} potentialAncestor - The commit that might be an ancestor
   * @param {string} descendant - The commit that might be a descendant
   * @returns {Promise<boolean>} True if potentialAncestor is an ancestor of descendant
   * @throws {Error} If either OID is invalid
   */
  async isAncestor(potentialAncestor, descendant) {
    this._validateOid(potentialAncestor);
    this._validateOid(descendant);
    try {
      await this._executeWithRetry({
        args: ['merge-base', '--is-ancestor', potentialAncestor, descendant]
      });
      return true;  // Exit code 0 means it IS an ancestor
    } catch (/** @type {*} */ err) { // TODO(ts-cleanup): type error
      if (this._getExitCode(err) === 1) {
        return false; // Exit code 1 means it is NOT an ancestor
      }
      throw err; // Re-throw unexpected errors
    }
  }

  /**
   * Reads a git config value.
   * @param {string} key - The config key to read (e.g., 'warp.writerId.events')
   * @returns {Promise<string|null>} The config value or null if not set
   * @throws {Error} If the key format is invalid
   */
  async configGet(key) {
    this._validateConfigKey(key);
    try {
      const value = await this._executeWithRetry({
        args: ['config', '--get', key]
      });
      // Preserve empty-string values; only drop trailing newline
      return value.replace(/\n$/, '');
    } catch (/** @type {*} */ err) { // TODO(ts-cleanup): type error
      if (this._isConfigKeyNotFound(err)) {
        return null;
      }
      throw err;
    }
  }

  /**
   * Sets a git config value.
   * @param {string} key - The config key to set (e.g., 'warp.writerId.events')
   * @param {string} value - The value to set
   * @returns {Promise<void>}
   * @throws {Error} If the key format is invalid or value is not a string
   */
  async configSet(key, value) {
    this._validateConfigKey(key);
    if (typeof value !== 'string') {
      throw new Error('Config value must be a string');
    }
    await this._executeWithRetry({
      args: ['config', key, value]
    });
  }

  /**
   * Validates that a config key is safe to use in git commands.
   * Delegates to shared validation in adapterValidation.js.
   * @param {string} key - The config key to validate
   * @throws {Error} If key is invalid
   * @private
   */
  _validateConfigKey(key) {
    validateConfigKey(key);
  }

  /**
   * Extracts the exit code from a Git command error.
   * Delegates to the standalone getExitCode helper.
   * @param {GitError} err - The error object
   * @returns {number|undefined} The exit code if found
   * @private
   */
  _getExitCode(err) {
    return getExitCode(err);
  }

  /**
   * Checks if an error indicates a config key was not found.
   * Exit code 1 from `git config --get` means the key doesn't exist.
   * @param {GitError} err - The error object
   * @returns {boolean} True if the error indicates key not found
   * @private
   */
  _isConfigKeyNotFound(err) {
    // Primary check: exit code 1 means key not found for git config --get
    if (this._getExitCode(err) === 1) {
      return true;
    }
    // Fallback for wrapped errors where exit code is embedded in message.
    // This is intentionally conservative - only matches the exact pattern
    // from git config failures to avoid false positives from unrelated errors.
    const msg = (err.message || '').toLowerCase();
    const stderr = (err.details?.stderr || '').toLowerCase();
    return msg.includes('exit code 1') || stderr.includes('exit code 1');
  }
}
