import { retry } from '@git-stunts/alfred';
import GraphPersistencePort from '../../ports/GraphPersistencePort.js';

/**
 * Transient git errors that are safe to retry.
 * @type {string[]}
 */
const TRANSIENT_ERROR_PATTERNS = [
  'cannot lock ref',
  'resource temporarily unavailable',
  'connection timed out',
];

/**
 * Determines if an error is transient and safe to retry.
 * @param {Error} error - The error to check
 * @returns {boolean} True if the error is transient
 */
function isTransientError(error) {
  const message = (error.message || '').toLowerCase();
  return TRANSIENT_ERROR_PATTERNS.some(pattern => message.includes(pattern));
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
 * Implementation of GraphPersistencePort using GitPlumbing.
 */
export default class GitGraphAdapter extends GraphPersistencePort {
  /**
   * @param {Object} options
   * @param {import('@git-stunts/plumbing').default} options.plumbing
   * @param {import('@git-stunts/alfred').RetryOptions} [options.retryOptions] - Custom retry options
   */
  constructor({ plumbing, retryOptions = {} }) {
    super();
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
    return retry(() => this.plumbing.execute(options), this._retryOptions);
  }

  get emptyTree() {
    return this.plumbing.emptyTree;
  }

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

  async showNode(sha) {
    this._validateOid(sha);
    return await this._executeWithRetry({ args: ['show', '-s', '--format=%B', sha] });
  }

  /**
   * Gets full commit metadata for a node.
   * @param {string} sha - The commit SHA to retrieve
   * @returns {Promise<{sha: string, message: string, author: string, date: string, parents: string[]}>}
   *   Full commit metadata
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
   * @returns {Promise<Stream>} A stream of git log output (NUL-terminated records)
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
   * Prevents command injection via malicious ref names.
   * @param {string} ref - The ref to validate
   * @throws {Error} If ref contains invalid characters, is too long, or starts with -/--
   * @private
   */
  _validateRef(ref) {
    if (!ref || typeof ref !== 'string') {
      throw new Error('Ref must be a non-empty string');
    }
    // Prevent buffer overflow attacks with extremely long refs
    if (ref.length > 1024) {
      throw new Error(`Ref too long: ${ref.length} chars. Maximum is 1024`);
    }
    // Prevent git option injection (must check before pattern matching)
    if (ref.startsWith('-') || ref.startsWith('--')) {
      throw new Error(`Invalid ref: ${ref}. Refs cannot start with - or --. See https://github.com/git-stunts/empty-graph#security`);
    }
    // Allow alphanumeric, ., /, -, _ in names
    // Allow ancestry operators: ^ or ~ optionally followed by digits
    // Allow range operators: .. between names
    const validRefPattern = /^[a-zA-Z0-9._/-]+((~\d*|\^\d*|\.\.[a-zA-Z0-9._/-]+)*)$/;
    if (!validRefPattern.test(ref)) {
      throw new Error(`Invalid ref format: ${ref}. Only alphanumeric characters, ., /, -, _, ^, ~, and range operators are allowed. See https://github.com/git-stunts/empty-graph#ref-validation`);
    }
  }

  async writeBlob(content) {
    const oid = await this._executeWithRetry({
      args: ['hash-object', '-w', '--stdin'],
      input: content,
    });
    return oid.trim();
  }

  async writeTree(entries) {
    const oid = await this._executeWithRetry({
      args: ['mktree'],
      input: `${entries.join('\n')}\n`,
    });
    return oid.trim();
  }

  async readTree(treeOid) {
    const oids = await this.readTreeOids(treeOid);
    const files = {};
    // Process sequentially to avoid spawning thousands of concurrent readBlob calls
    for (const [path, oid] of Object.entries(oids)) {
      files[path] = await this.readBlob(oid);
    }
    return files;
  }

  async readTreeOids(treeOid) {
    this._validateOid(treeOid);
    const output = await this._executeWithRetry({
      args: ['ls-tree', '-r', '-z', treeOid]
    });

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

  async readBlob(oid) {
    this._validateOid(oid);
    const stream = await this.plumbing.executeStream({
      args: ['cat-file', 'blob', oid]
    });
    return await stream.collect({ asString: false });
  }

  /**
   * Updates a ref to point to an OID.
   * @param {string} ref - The ref name (e.g., 'refs/empty-graph/index')
   * @param {string} oid - The OID to point to
   * @returns {Promise<void>}
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
   * @returns {Promise<string|null>} The OID or null if ref doesn't exist
   */
  async readRef(ref) {
    this._validateRef(ref);
    try {
      const oid = await this._executeWithRetry({
        args: ['rev-parse', ref]
      });
      return oid.trim();
    } catch (err) {
      // Only return null for "ref not found" errors; rethrow others
      const msg = (err.message || '').toLowerCase();
      const isNotFound =
        msg.includes('unknown revision') ||
        msg.includes('ambiguous argument') ||
        msg.includes('no such ref') ||
        msg.includes('bad revision');
      if (isNotFound) {
        return null;
      }
      throw err;
    }
  }

  /**
   * Deletes a ref.
   * @param {string} ref - The ref name to delete
   * @returns {Promise<void>}
   */
  async deleteRef(ref) {
    this._validateRef(ref);
    await this._executeWithRetry({
      args: ['update-ref', '-d', ref]
    });
  }

  /**
   * Validates that an OID is safe to use in git commands.
   * @param {string} oid - The OID to validate
   * @throws {Error} If OID is invalid
   * @private
   */
  _validateOid(oid) {
    if (!oid || typeof oid !== 'string') {
      throw new Error('OID must be a non-empty string');
    }
    if (oid.length > 64) {
      throw new Error(`OID too long: ${oid.length} chars. Maximum is 64`);
    }
    const validOidPattern = /^[0-9a-fA-F]{4,64}$/;
    if (!validOidPattern.test(oid)) {
      throw new Error(`Invalid OID format: ${oid}`);
    }
  }

  /**
   * Validates that a limit is a safe positive integer.
   * @param {number} limit - The limit to validate
   * @throws {Error} If limit is invalid
   * @private
   */
  _validateLimit(limit) {
    if (typeof limit !== 'number' || !Number.isFinite(limit)) {
      throw new Error('Limit must be a finite number');
    }
    if (!Number.isInteger(limit)) {
      throw new Error('Limit must be an integer');
    }
    if (limit <= 0) {
      throw new Error('Limit must be a positive integer');
    }
    if (limit > 10_000_000) {
      throw new Error(`Limit too large: ${limit}. Maximum is 10,000,000`);
    }
  }

  /**
   * Checks if a node (commit) exists in the repository.
   * Uses `git cat-file -e` for efficient existence checking without loading content.
   * @param {string} sha - The commit SHA to check
   * @returns {Promise<boolean>} True if the node exists, false otherwise
   */
  async nodeExists(sha) {
    this._validateOid(sha);
    try {
      await this._executeWithRetry({ args: ['cat-file', '-e', sha] });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Pings the repository to verify accessibility.
   * Uses `git rev-parse --git-dir` as a lightweight check.
   * @returns {Promise<{ok: boolean, latencyMs: number}>} Health check result with latency
   */
  async ping() {
    const start = Date.now();
    try {
      await this._executeWithRetry({ args: ['rev-parse', '--git-dir'] });
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
   */
  async isAncestor(potentialAncestor, descendant) {
    this._validateOid(potentialAncestor);
    this._validateOid(descendant);
    try {
      await this._executeWithRetry({
        args: ['merge-base', '--is-ancestor', potentialAncestor, descendant]
      });
      return true;  // Exit code 0 means it IS an ancestor
    } catch {
      return false; // Exit code 1 means it is NOT an ancestor
    }
  }
}
