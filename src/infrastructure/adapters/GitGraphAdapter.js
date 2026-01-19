import GraphPersistencePort from '../../ports/GraphPersistencePort.js';

/**
 * Implementation of GraphPersistencePort using GitPlumbing.
 */
export default class GitGraphAdapter extends GraphPersistencePort {
  /**
   * @param {Object} options
   * @param {import('@git-stunts/plumbing').default} options.plumbing
   */
  constructor({ plumbing }) {
    super();
    this.plumbing = plumbing;
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

    const oid = await this.plumbing.execute({ args });
    return oid.trim();
  }

  async showNode(sha) {
    this._validateOid(sha);
    return await this.plumbing.execute({ args: ['show', '-s', '--format=%B', sha] });
  }

  async logNodes({ ref, limit = 50, format }) {
    this._validateRef(ref);
    this._validateLimit(limit);
    const args = ['log', `-${limit}`];
    if (format) {
      args.push(`--format=${format}`);
    }
    args.push(ref);
    return await this.plumbing.execute({ args });
  }

  async logNodesStream({ ref, limit = 1000000, format }) {
    this._validateRef(ref);
    this._validateLimit(limit);
    const args = ['log', `-${limit}`];
    if (format) {
      args.push(`--format=${format}`);
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
    const oid = await this.plumbing.execute({
      args: ['hash-object', '-w', '--stdin'],
      input: content,
    });
    return oid.trim();
  }

  async writeTree(entries) {
    const oid = await this.plumbing.execute({
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
    const output = await this.plumbing.execute({
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
    await this.plumbing.execute({
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
      const oid = await this.plumbing.execute({
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
    await this.plumbing.execute({
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
}
