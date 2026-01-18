import GraphPersistencePort from '../../ports/GraphPersistencePort.js';

/**
 * Implementation of GraphPersistencePort using GitPlumbing.
 */
export default class GitGraphAdapter extends GraphPersistencePort {
  /**
   * @param {Object} options
   * @param {import('../../../plumbing/index.js').default} options.plumbing
   */
  constructor({ plumbing }) {
    super();
    this.plumbing = plumbing;
  }

  get emptyTree() {
    return this.plumbing.emptyTree;
  }

  async commitNode({ message, parents = [], sign = false }) {
    const parentArgs = parents.flatMap(p => ['-p', p]);
    const signArgs = sign ? ['-S'] : [];
    const args = ['commit-tree', this.emptyTree, ...parentArgs, ...signArgs, '-m', message];

    return await this.plumbing.execute({ args });
  }

  async showNode(sha) {
    return await this.plumbing.execute({ args: ['show', '-s', '--format=%B', sha] });
  }

  async logNodes({ ref, limit = 50, format }) {
    this._validateRef(ref);
    return await this.plumbing.execute({ args: ['log', `-${limit}`, `--format=${format}`, ref] });
  }

  async logNodesStream({ ref, limit = 1000000, format }) {
    this._validateRef(ref);
    return await this.plumbing.executeStream({ args: ['log', `-${limit}`, `--format=${format}`, ref] });
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
    // Allow alphanumeric, /, -, _, and ^~. (common git ref patterns)
    const validRefPattern = /^[a-zA-Z0-9_/-]+(\^|~|\.\.|\.)*$/;
    if (!validRefPattern.test(ref)) {
      throw new Error(`Invalid ref format: ${ref}. Only alphanumeric characters, /, -, _, ^, ~, and . are allowed. See https://github.com/git-stunts/empty-graph#ref-validation`);
    }
    // Prevent git option injection
    if (ref.startsWith('-') || ref.startsWith('--')) {
      throw new Error(`Invalid ref: ${ref}. Refs cannot start with - or --. See https://github.com/git-stunts/empty-graph#security`);
    }
  }

  async writeBlob(content) {
    return await this.plumbing.execute({
      args: ['hash-object', '-w', '--stdin'],
      input: content,
    });
  }

  async writeTree(entries) {
    return await this.plumbing.execute({
      args: ['mktree'],
      input: `${entries.join('\n')}\n`,
    });
  }

  async readTree(treeOid) {
    const oids = await this.readTreeOids(treeOid);
    const files = {};
    await Promise.all(Object.entries(oids).map(async ([path, oid]) => {
      files[path] = await this.readBlob(oid);
    }));
    return files;
  }

  async readTreeOids(treeOid) {
    const output = await this.plumbing.execute({
      args: ['ls-tree', '-r', treeOid]
    });
    
    const oids = {};
    const lines = output.trim().split('\n');
    for (const line of lines) {
      if (!line) {
        continue;
      }
      const [meta, path] = line.split('\t');
      const [, , oid] = meta.split(' ');
      oids[path] = oid;
    }
    return oids;
  }

  async readBlob(oid) {
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
    } catch {
      return null;
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
}
