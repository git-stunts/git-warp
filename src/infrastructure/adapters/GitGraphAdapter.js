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
import PersistenceError from '../../domain/errors/PersistenceError.js';
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
 * @typedef {Error & { details?: { stderr?: string, stdout?: string, code?: number }, exitCode?: number, code?: number }} GitError
 */

/**
 * @typedef {{ collect(opts?: { asString?: boolean }): Promise<Buffer | string> } & import('node:stream').Readable} CollectableStream
 */

/**
 * @typedef {object} GitPlumbingLike
 * @property {string} emptyTree - The well-known SHA for Git's empty tree
 * @property {(options: { args: string[], input?: string | Buffer }) => Promise<string>} execute - Execute a git command
 * @property {(options: { args: string[] }) => Promise<CollectableStream>} executeStream - Execute a git command returning a stream
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

/** @typedef {import('@git-stunts/alfred').RetryOptions} RetryOptions */

/**
 * Default retry options for git operations.
 * Uses exponential backoff with decorrelated jitter.
 * @type {RetryOptions}
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
 * Checks if a Git error indicates a dangling or missing object.
 * Exit code 128 with specific stderr patterns means the ref exists but
 * points to a missing object. Other exit-128 failures (bad repo, corrupt
 * index, permission errors) are NOT considered dangling and will re-throw.
 * @param {GitError} err
 * @returns {boolean}
 */
function isDanglingObjectError(err) {
  if (getExitCode(err) !== 128) {
    return false;
  }
  const stderr = (err.details?.stderr || '').toLowerCase();
  return (
    stderr.includes('bad object') ||
    stderr.includes('not a valid object name') ||
    stderr.includes('does not point to a valid object')
  );
}

/** @type {string[]} Stderr/message patterns indicating a missing Git object. */
const MISSING_OBJECT_PATTERNS = [
  'bad object',
  'not a valid object name',
  'does not point to a valid object',
  'missing object',
  'not a commit',
  'could not read',
];

/** @type {string[]} Stderr/message patterns indicating a ref was not found. */
const REF_NOT_FOUND_PATTERNS = [
  'not found',
  'does not exist',
  'unknown revision',
  'bad revision',
];

/** @type {string[]} Stderr/message patterns indicating a ref I/O failure. */
const REF_IO_PATTERNS = [
  'cannot lock ref',
  'unable to create',
  'permission denied',
  'failed to lock',
];

/**
 * Builds a combined search string from an error's message and stderr.
 * @param {GitError} err
 * @returns {string}
 */
function errorSearchText(err) {
  const message = (err.message || '').toLowerCase();
  const stderr = (err.details?.stderr || '').toLowerCase();
  return `${message} ${stderr}`;
}

/**
 * Returns stderr/stdout diagnostic text from a Git error, ignoring wrapper
 * messages like "Git command failed with code 1" that do not carry object
 * lookup semantics on their own.
 * @param {GitError} err
 * @returns {string}
 */
function gitDiagnosticText(err) {
  const stderr = String(err?.details?.stderr || '');
  const stdout = String(err?.details?.stdout || '');
  return `${stderr} ${stdout}`.trim().toLowerCase();
}

/**
 * Checks if a Git error indicates a missing object (commit, blob, tree).
 * Covers exit code 128 with object-related stderr patterns.
 * @param {GitError} err
 * @returns {boolean}
 */
function isMissingObjectError(err) {
  const code = getExitCode(err);
  if (code !== 128 && code !== 1) {
    return false;
  }
  const text = errorSearchText(err);
  return MISSING_OBJECT_PATTERNS.some(p => text.includes(p));
}

/**
 * Checks if a Git error indicates a ref not found condition.
 * Covers patterns like "not found", "does not exist", "unknown revision".
 * Gated on exit codes 1 (rev-parse --verify --quiet) and 128 (fatal).
 * @param {GitError} err
 * @returns {boolean}
 */
function isRefNotFoundError(err) {
  const code = getExitCode(err);
  if (code !== 128 && code !== 1) {
    return false;
  }
  const text = errorSearchText(err);
  return REF_NOT_FOUND_PATTERNS.some(p => text.includes(p));
}

/**
 * Checks if a Git error indicates a ref I/O failure
 * (lock contention that exhausted retries, permission errors, etc.).
 * Gated on exit code 128 (fatal).
 * @param {GitError} err
 * @returns {boolean}
 */
function isRefIoError(err) {
  if (getExitCode(err) !== 128) {
    return false;
  }
  const text = errorSearchText(err);
  return REF_IO_PATTERNS.some(p => text.includes(p));
}

/**
 * Wraps a raw Git error in a typed PersistenceError when the failure
 * matches a known pattern. Returns the original error unchanged if
 * no pattern matches.
 * @param {GitError} err - The raw error from Git plumbing
 * @param {{ ref?: string, oid?: string }} [hint={}] - Optional context hints
 * @returns {PersistenceError|GitError}
 */
function wrapGitError(err, hint = {}) {
  if (isMissingObjectError(err)) {
    return new PersistenceError(
      hint.oid ? `Missing Git object: ${hint.oid}` : err.message,
      PersistenceError.E_MISSING_OBJECT,
      { cause: /** @type {Error} */ (err), context: { ...hint } },
    );
  }
  if (isRefNotFoundError(err)) {
    return new PersistenceError(
      hint.ref ? `Ref not found: ${hint.ref}` : err.message,
      PersistenceError.E_REF_NOT_FOUND,
      { cause: /** @type {Error} */ (err), context: { ...hint } },
    );
  }
  if (isRefIoError(err)) {
    return new PersistenceError(
      hint.ref ? `Ref I/O error: ${hint.ref}` : err.message,
      PersistenceError.E_REF_IO,
      { cause: /** @type {Error} */ (err), context: { ...hint } },
    );
  }
  return err;
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
   * @param {{ plumbing: GitPlumbingLike, retryOptions?: Partial<RetryOptions> }} options - Configuration options
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
   * @param {{ args: string[], input?: string | Buffer }} options - Options to pass to plumbing.execute
   * @returns {Promise<string>} Command output
   * @private
   */
  async _executeWithRetry(options) {
    return await retry(() => this.plumbing.execute(options), this._retryOptions);
  }

  /**
   * Distinguishes a legitimate zero-byte blob from a missing object when a
   * blob stream returns no bytes. Some plumbing implementations surface the
   * missing object case as an empty collect result instead of throwing.
   *
   * @param {string} oid
   * @returns {Promise<void>}
   * @private
   */
  async _assertBlobExistsForEmptyRead(oid) {
    try {
      await this._executeWithRetry({ args: ['cat-file', '-e', oid] });
    } catch (err) {
      const gitErr = /** @type {GitError} */ (err);
      const wrapped = wrapGitError(gitErr, { oid });
      const exitCode = getExitCode(gitErr);
      const diagnostics = gitDiagnosticText(gitErr);
      const ambiguousMissingObject = exitCode === 1 && diagnostics === '';
      if (wrapped === gitErr && ambiguousMissingObject) {
        throw new PersistenceError(
          `Missing Git object: ${oid}`,
          PersistenceError.E_MISSING_OBJECT,
          { cause: /** @type {Error} */ (gitErr), context: { oid } },
        );
      }
      throw wrapped;
    }
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
   * Shared helper for commit creation. Validates parents, builds args, and
   * executes `git commit-tree` with retry.
   * @param {{ tree: string, parents: string[], message: string, sign: boolean }} opts
   * @returns {Promise<string>} The created commit SHA
   * @private
   */
  async _createCommit({ tree, parents, message, sign }) {
    for (const p of parents) {
      this._validateOid(p);
    }
    const parentArgs = parents.flatMap(p => ['-p', p]);
    const signArgs = sign ? ['-S'] : [];
    const args = ['commit-tree', tree, ...parentArgs, ...signArgs, '-m', message];

    const oid = await this._executeWithRetry({ args });
    return oid.trim();
  }

  /**
   * Creates a commit pointing to the empty tree.
   * @param {{ message: string, parents?: string[], sign?: boolean }} options
   * @returns {Promise<string>} The SHA of the created commit
   * @throws {Error} If any parent OID is invalid
   */
  async commitNode({ message, parents = [], sign = false }) {
    return await this._createCommit({ tree: this.emptyTree, parents, message, sign });
  }

  /**
   * Creates a commit pointing to a custom tree (not the empty tree).
   * Used for WARP patch commits that have attachment trees.
   * @param {{ treeOid: string, parents?: string[], message: string, sign?: boolean }} options
   * @returns {Promise<string>} The created commit SHA
   */
  async commitNodeWithTree({ treeOid, parents = [], message, sign = false }) {
    this._validateOid(treeOid);
    return await this._createCommit({ tree: treeOid, parents, message, sign });
  }

  /**
   * Retrieves the raw commit message for a given SHA.
   * @param {string} sha - The commit SHA to read
   * @returns {Promise<string>} The raw commit message content
   * @throws {Error} If the SHA is invalid
   */
  async showNode(sha) {
    this._validateOid(sha);
    try {
      return await this._executeWithRetry({ args: ['show', '-s', '--format=%B', sha] });
    } catch (err) {
      throw wrapGitError(/** @type {GitError} */ (err), { oid: sha });
    }
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
    let output;
    try {
      output = await this._executeWithRetry({
        args: ['show', '-s', `--format=${format}`, sha]
      });
    } catch (err) {
      throw wrapGitError(/** @type {GitError} */ (err), { oid: sha });
    }

    const parts = output.split('\x00');
    if (parts.length < 5) {
      // Object exists but output is malformed — semantically closest to
      // E_MISSING_OBJECT since the commit is unusable for data extraction.
      throw new PersistenceError(
        `Invalid commit format for SHA ${sha}`,
        PersistenceError.E_MISSING_OBJECT,
        { context: { oid: sha } },
      );
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
   * Retrieves the tree OID for a given commit SHA.
   * @param {string} sha - The commit SHA to query
   * @returns {Promise<string>} The tree OID pointed to by the commit
   * @throws {Error} If the SHA is invalid
   */
  async getCommitTree(sha) {
    this._validateOid(sha);
    try {
      const output = await this._executeWithRetry({
        args: ['rev-parse', `${sha}^{tree}`]
      });
      return output.trim();
    } catch (err) {
      throw wrapGitError(/** @type {GitError} */ (err), { oid: sha });
    }
  }

  /**
   * Returns raw git log output for a ref.
   * @param {{ ref: string, limit?: number, format?: string }} options
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
    try {
      return await this._executeWithRetry({ args });
    } catch (err) {
      throw wrapGitError(/** @type {GitError} */ (err), { ref });
    }
  }

  /**
   * Streams git log output for the given ref.
   * Uses the -z flag to produce NUL-terminated output, which:
   * - Ensures reliable parsing of commits with special characters in messages
   * - Ignores the i18n.logOutputEncoding config setting for consistent output
   * @param {{ ref: string, limit?: number, format?: string }} options
   * @returns {Promise<import('node:stream').Readable>} A readable stream of git log output (NUL-terminated records)
   * @throws {Error} If the ref is invalid or the limit is out of range
   */
  async logNodesStream({ ref, limit = 1000000, format }) {
    this._validateRef(ref);
    this._validateLimit(limit);
    // -z flag ensures NUL-terminated output and ignores i18n.logOutputEncoding config
    const args = ['log', '-z', `-${limit}`];
    if (format) {
      // Strip NUL (\x00) bytes from the caller-supplied format string.
      // Why: Git's -z flag uses NUL as the record terminator in its output.
      // If a format string contains literal NUL bytes (e.g. from %x00 expansion
      // or caller-constructed strings), they corrupt the NUL-delimited output
      // stream, causing downstream parsers to split records at the wrong
      // boundaries. Additionally, Node.js child_process rejects argv entries
      // that contain null bytes, so passing them through would throw.
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
   *
   * Instance method for port interface conformance and test mockability.
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
   * Reads blobs in batches of 16 to balance concurrency against fd/process limits.
   * @param {string} treeOid - The tree OID to read
   * @returns {Promise<Record<string, Uint8Array>>} Map of file path to blob content
   */
  async readTree(treeOid) {
    const oids = await this.readTreeOids(treeOid);
    /** @type {Record<string, Uint8Array>} */
    const files = {};
    const entries = Object.entries(oids);
    const BATCH_SIZE = 16;
    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = entries.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(([, oid]) => this.readBlob(oid))
      );
      for (let j = 0; j < batch.length; j++) {
        files[batch[j][0]] = results[j];
      }
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
    let output;
    try {
      output = await this._executeWithRetry({
        args: ['ls-tree', '-r', '-z', treeOid]
      });
    } catch (err) {
      throw wrapGitError(/** @type {GitError} */ (err), { oid: treeOid });
    }

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
   * @returns {Promise<Uint8Array>} The blob content
   * @throws {Error} If the OID is invalid
   */
  async readBlob(oid) {
    this._validateOid(oid);
    try {
      const stream = await this.plumbing.executeStream({
        args: ['cat-file', 'blob', oid]
      });
      const raw = await stream.collect({ asString: false });
      // Some executeStream implementations can surface a missing object as an
      // empty collect result instead of throwing. Distinguish that from a real
      // zero-byte blob with an explicit existence check.
      if (raw.length === 0) {
        await this._assertBlobExistsForEmptyRead(oid);
      }
      // Return as-is — plumbing returns Buffer (which IS-A Uint8Array)
      return /** @type {Uint8Array} */ (raw);
    } catch (err) {
      throw wrapGitError(/** @type {GitError} */ (err), { oid });
    }
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
    try {
      await this._executeWithRetry({
        args: ['update-ref', ref, oid]
      });
    } catch (err) {
      throw wrapGitError(/** @type {GitError} */ (err), { ref, oid });
    }
  }

  /**
   * Reads the OID a ref points to.
   * @param {string} ref - The ref name
   * @returns {Promise<string|null>} The OID, or null if the ref does not exist or points to a dangling/missing object
   * @throws {Error} If the ref format is invalid
   */
  async readRef(ref) {
    this._validateRef(ref);
    try {
      // --verify ensures exactly one revision is resolved; --quiet suppresses
      // error messages and makes exit code 1 (not 128) the indicator for
      // "ref does not exist", simplifying downstream handling.
      const oid = await this._executeWithRetry({
        args: ['rev-parse', '--verify', '--quiet', ref]
      });
      return oid.trim();
    } catch (err) {
      const gitErr = /** @type {GitError} */ (err);
      // Exit code 1: ref does not exist (normal with --verify --quiet)
      if (getExitCode(gitErr) === 1) {
        return null;
      }
      // Exit code 128 with dangling-object stderr: ref exists but target is missing
      if (isDanglingObjectError(gitErr)) {
        return null;
      }
      throw wrapGitError(gitErr, { ref });
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
    // null means "ref must not exist" → use zero OID (always 40 chars for SHA-1)
    const oldArg = expectedOid || '0'.repeat(40);
    if (expectedOid) {
      this._validateOid(expectedOid);
    }
    // Direct call — CAS failures are semantically expected and must NOT be retried.
    try {
      await this.plumbing.execute({
        args: ['update-ref', ref, newOid, oldArg],
      });
    } catch (err) {
      throw wrapGitError(/** @type {GitError} */ (err), { ref, oid: newOid });
    }
  }

  /**
   * Deletes a ref.
   * @param {string} ref - The ref name to delete
   * @returns {Promise<void>}
   * @throws {Error} If the ref format is invalid
   */
  async deleteRef(ref) {
    this._validateRef(ref);
    try {
      await this._executeWithRetry({
        args: ['update-ref', '-d', ref]
      });
    } catch (err) {
      throw wrapGitError(/** @type {GitError} */ (err), { ref });
    }
  }

  /**
   * Validates that an OID is safe to use in git commands.
   * Delegates to shared validation in adapterValidation.js.
   *
   * Exists as a method (rather than inlining the import) so tests can
   * spy/stub validation independently and so future adapters sharing
   * the same port interface can override validation rules.
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
   *
   * Instance method for port interface conformance and test mockability.
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
    } catch (err) {
      if (getExitCode(/** @type {GitError} */ (err)) === 1) {
        return false;
      }
      throw err;
    }
  }

  /**
   * Lists refs matching a prefix.
   * @param {string} prefix - The ref prefix to match (e.g., 'refs/warp/events/writers/')
   * @param {{ limit?: number }} [options] - Optional parameters. When `limit` is omitted or 0, all matching refs are returned.
   * @returns {Promise<string[]>} Array of matching ref paths
   * @throws {Error} If the prefix is invalid or the limit is out of range
   */
  async listRefs(prefix, options) {
    this._validateRef(prefix);
    const limit = options?.limit;
    const args = ['for-each-ref', '--format=%(refname)'];
    if (limit) {
      this._validateLimit(limit);
      args.push(`--count=${limit}`);
    }
    args.push(prefix);
    let output;
    try {
      output = await this._executeWithRetry({ args });
    } catch (err) {
      throw wrapGitError(/** @type {GitError} */ (err), { ref: prefix });
    }
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
    try {
      const output = await this._executeWithRetry({
        args: ['rev-list', '--count', ref]
      });
      return parseInt(output.trim(), 10);
    } catch (err) {
      throw wrapGitError(/** @type {GitError} */ (err), { ref });
    }
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
    } catch (err) {
      if (this._getExitCode(/** @type {GitError} */ (err)) === 1) {
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
    } catch (err) {
      if (this._isConfigKeyNotFound(/** @type {GitError} */ (err))) {
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
   *
   * Instance method for port interface conformance and test mockability.
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
