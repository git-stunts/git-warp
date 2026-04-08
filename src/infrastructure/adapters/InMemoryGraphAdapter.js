/* eslint-disable @typescript-eslint/require-await -- all async methods match the port contract */
/**
 * @fileoverview In-memory persistence adapter for WARP graph storage.
 *
 * Implements the same {@link GraphPersistencePort} contract as GitGraphAdapter
 * but stores all data in Maps. Designed for fast unit/integration tests that
 * don't need real Git I/O.
 *
 * SHA computation follows Git's object format so debugging is straightforward,
 * but cross-adapter SHA matching is NOT guaranteed.
 *
 * Browser-compatible: the only Node-specific dependency (node:crypto) is
 * lazy-loaded and can be replaced via the `hash` constructor option.
 *
 * @module infrastructure/adapters/InMemoryGraphAdapter
 */

import GraphPersistencePort from '../../ports/GraphPersistencePort.ts';
import PersistenceError from '../../domain/errors/PersistenceError.ts';
import WarpError from '../../domain/errors/WarpError.ts';
import { validateOid, validateRef, validateLimit, validateConfigKey } from './adapterValidation.js';

// ── Browser-safe byte helpers ────────────────────────────────────────

const _encoder = new TextEncoder();

/**
 * Concatenates an array of Uint8Array instances into one.
 * @param {Uint8Array[]} arrays
 * @returns {Uint8Array}
 */
function concatBytes(arrays) {
  const len = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(len);
  let offset = 0;
  for (const a of arrays) {
    result.set(a, offset);
    offset += a.length;
  }
  return result;
}

/**
 * Converts a hex string to a Uint8Array.
 * @param {string} hex
 * @returns {Uint8Array}
 */
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Converts a string or Uint8Array to bytes.
 * @param {string|Uint8Array} data
 * @returns {Uint8Array}
 */
function toBytes(data) {
  if (data instanceof Uint8Array) {
    return data;
  }
  if (typeof data === 'string') {
    return _encoder.encode(data);
  }
  throw new WarpError('Expected string or Uint8Array', 'E_INVALID_INPUT');
}

// ── Lazy node:crypto for default hash ────────────────────────────────

/**
 * Module-level crypto probe state — intentionally shared across all
 * InMemoryGraphAdapter instances.  The probe runs at most once per
 * process; subsequent instances reuse the cached result.  This avoids
 * repeated dynamic `import('node:crypto')` calls which are both slow
 * and unnecessary (the availability of node:crypto doesn't change
 * within a single process lifetime).
 */
/** @type {Function|null} */
let _nodeCreateHash = null;
/** @type {boolean} */
let _cryptoProbed = false;

/**
 * Lazily probes for node:crypto on first call. Avoids top-level await
 * which forces the module into async evaluation — problematic for
 * bundlers and non-Node runtimes where the import always fails.
 *
 * @returns {Promise<Function|null>} createHash or null
 */
async function probeNodeCrypto() {
  if (_cryptoProbed) {
    return _nodeCreateHash;
  }
  _cryptoProbed = true;
  try {
    const nodeCrypto = await import('node:crypto');
    _nodeCreateHash = nodeCrypto.createHash;
  } catch {
    // Browser or non-Node runtime — hash must be injected via constructor
  }
  return _nodeCreateHash;
}

/**
 * Default hash function using node:crypto SHA-1.
 * Synchronous after the first call resolves the lazy probe.
 *
 * @param {Uint8Array} data
 * @returns {string} 40-hex SHA
 */
function defaultHash(data) {
  if (_nodeCreateHash === null) {
    throw new WarpError(
      'No hash function available. Pass { hash } to InMemoryGraphAdapter constructor.',
      'E_NO_HASH',
    );
  }
  const createHash = /** @type {(algorithm: string) => {update: (d: Uint8Array) => {digest: (enc: string) => string}}} */ (_nodeCreateHash);
  return createHash('sha1').update(data).digest('hex');
}

/** Well-known SHA for Git's empty tree. */
const EMPTY_TREE_OID = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

/**
 * Eagerly kicks off the async crypto probe when no custom hash is provided.
 * @param {((data: Uint8Array) => string)|undefined} hash - Custom hash if provided
 * @returns {Promise<Function|null>} Resolves when crypto is ready
 */
function _initCryptoReady(hash) {
  if (hash !== null && hash !== undefined) {
    return Promise.resolve(null);
  }
  return probeNodeCrypto();
}

// ── SHA helpers ─────────────────────────────────────────────────────────

/**
 * Computes a Git blob SHA-1: `SHA1("blob " + len + "\0" + content)`.
 * @param {(data: Uint8Array) => string} hash
 * @param {Uint8Array} content
 * @returns {string} 40-hex SHA
 */
function hashBlob(hash, content) {
  const header = _encoder.encode(`blob ${content.length}\0`);
  return hash(concatBytes([header, content]));
}

/**
 * Builds the binary tree buffer in Git's internal format and hashes it.
 *
 * Each entry is: `<mode> <path>\0<20-byte binary OID>`
 * Entries are sorted by path (byte order), matching Git's canonical sort.
 *
 * @param {(data: Uint8Array) => string} hash
 * @param {Array<{mode: string, path: string, oid: string}>} entries
 * @returns {string} 40-hex SHA
 */
function hashTree(hash, entries) {
  const sorted = [...entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const parts = sorted.map(e => {
    const prefix = _encoder.encode(`${e.mode} ${e.path}\0`);
    return concatBytes([prefix, hexToBytes(e.oid)]);
  });
  const body = concatBytes(parts);
  const header = _encoder.encode(`tree ${body.length}\0`);
  return hash(concatBytes([header, body]));
}

/**
 * Builds a Git-style commit string and hashes it.
 * @param {(data: Uint8Array) => string} hash
 * @param {{treeOid: string, parents: string[], message: string, author: string, date: string}} opts
 * @returns {string} 40-hex SHA
 */
function hashCommit(hash, { treeOid, parents, message, author, date }) {
  const lines = [`tree ${treeOid}`];
  for (const p of parents) {
    lines.push(`parent ${p}`);
  }
  lines.push(`author ${author} ${date}`);
  lines.push(`committer ${author} ${date}`);
  lines.push('');
  lines.push(message);
  const bodyBytes = _encoder.encode(lines.join('\n'));
  const header = _encoder.encode(`commit ${bodyBytes.length}\0`);
  return hash(concatBytes([header, bodyBytes]));
}

/**
 * Parses a single mktree-formatted line into mode, path, and oid.
 * @param {string} line - A line in `"<mode> <type> <oid>\t<path>"` format
 * @returns {{mode: string, path: string, oid: string}}
 */
function _parseMktreeEntry(line) {
  const tabIdx = line.indexOf('\t');
  if (tabIdx === -1) {
    throw new PersistenceError(
      `Invalid mktree entry (missing tab): ${line}`,
      PersistenceError.E_MISSING_OBJECT,
    );
  }
  const meta = line.slice(0, tabIdx);
  const path = line.slice(tabIdx + 1);
  const [mode = '', , oid = ''] = meta.split(' ');
  return { mode, path, oid };
}

/**
 * Default clock backed by Date.now for timestamp generation.
 * @type {{ now: () => number }}
 */
const _defaultClock = { /** Returns the current epoch milliseconds. @returns {number} */ now: () => Date.now() };

/**
 * Returns the author string, falling back to a default if absent.
 * @param {string|undefined} author
 * @returns {string}
 */
function _resolveAuthor(author) {
  return typeof author === 'string' && author.length > 0 ? author : 'InMemory <inmemory@test>';
}

/**
 * Returns the clock, falling back to the default if absent.
 * @param {{ now: () => number }|undefined} clock
 * @returns {{ now: () => number }}
 */
function _resolveClock(clock) {
  return clock !== null && clock !== undefined ? clock : _defaultClock;
}

/**
 * Returns the hash function, falling back to the default if absent.
 * @param {((data: Uint8Array) => string)|undefined} hash
 * @returns {(data: Uint8Array) => string}
 */
function _resolveHash(hash) {
  return hash !== null && hash !== undefined ? hash : defaultHash;
}

/**
 * Resolves constructor options, applying defaults for missing fields.
 * @param {{ author?: string, clock?: { now: () => number }, hash?: (data: Uint8Array) => string }|undefined} options
 * @returns {{ author: string, clock: { now: () => number }, hash: (data: Uint8Array) => string }}
 */
function _resolveOptions(options) {
  const opts = options !== null && options !== undefined ? options : {};
  return {
    author: _resolveAuthor(opts.author),
    clock: _resolveClock(opts.clock),
    hash: _resolveHash(opts.hash),
  };
}

/**
 * Applies an optional limit to a sorted array of strings.
 * @param {string[]} sorted
 * @param {number|undefined} limit
 * @returns {string[]}
 */
function _applyLimit(sorted, limit) {
  if (typeof limit === 'number' && limit > 0) {
    validateLimit(limit);
    return sorted.slice(0, limit);
  }
  return sorted;
}

/**
 * Validates expectedOid if it is a non-empty string.
 * @param {string|null} expectedOid
 * @returns {void}
 */
function _validateExpectedOid(expectedOid) {
  if (typeof expectedOid === 'string' && expectedOid.length > 0) {
    validateOid(expectedOid);
  }
}

/**
 * Formats a nullable OID for display in error messages.
 * @param {string|null} oid
 * @returns {string}
 */
function _displayOid(oid) {
  return typeof oid === 'string' && oid.length > 0 ? oid : '(none)';
}

/**
 * Builds a PersistenceError for a CAS mismatch.
 * @param {string} ref
 * @param {string|null} expectedOid
 * @param {string|null} current
 * @returns {PersistenceError}
 */
function _casMismatchError(ref, expectedOid, current) {
  return new PersistenceError(
    `CAS mismatch on ${ref}: expected ${_displayOid(expectedOid)}, got ${_displayOid(current)}`,
    PersistenceError.E_REF_IO,
  );
}

// ── Adapter ─────────────────────────────────────────────────────────────

/**
 * In-memory implementation of {@link GraphPersistencePort}.
 *
 * Data structures:
 * - `_commits` — Map<sha, {treeOid, parents[], message, author, date}>
 * - `_blobs`   — Map<oid, Uint8Array>
 * - `_trees`   — Map<oid, Array<{mode, path, oid}>>
 * - `_refs`    — Map<refName, sha>
 * - `_config`  — Map<key, value>
 *
 * @extends GraphPersistencePort
 */
export default class InMemoryGraphAdapter extends GraphPersistencePort {
  /**
   * Creates a new in-memory graph adapter with optional author, clock, and hash overrides.
   * @param {{ author?: string, clock?: { now: () => number }, hash?: (data: Uint8Array) => string }} [options]
   */
  constructor(options = undefined) {
    super();
    const resolved = _resolveOptions(options);
    this._author = resolved.author;
    this._clock = resolved.clock;
    this._hash = resolved.hash;
    const rawHash = options !== null && options !== undefined ? options.hash : undefined;
    this._cryptoReady = _initCryptoReady(rawHash);

    /** @type {Map<string, {treeOid: string, parents: string[], message: string, author: string, date: string}>} */
    this._commits = new Map();
    /** @type {Map<string, Uint8Array>} */
    this._blobs = new Map();
    /** @type {Map<string, Array<{mode: string, path: string, oid: string}>>} */
    this._trees = new Map();
    /** @type {Map<string, string>} */
    this._refs = new Map();
    /** @type {Map<string, string>} */
    this._config = new Map();
  }

  // ── TreePort ────────────────────────────────────────────────────────

  /** Returns the well-known Git empty tree SHA.
   * @type {string} */
  get emptyTree() {
    return EMPTY_TREE_OID;
  }

  /**
   * Creates a tree from mktree-formatted entries.
   * @param {string[]} entries - Lines in `"<mode> <type> <oid>\t<path>"` format
   * @returns {Promise<string>}
   */
  async writeTree(entries) {
    await this._cryptoReady;
    const parsed = entries.map(line => _parseMktreeEntry(line));
    const oid = hashTree(this._hash, parsed);
    this._trees.set(oid, parsed);
    return oid;
  }

  /**
   * Reads all entry OIDs from a stored tree object.
   * @param {string} treeOid
   * @returns {Promise<Record<string, string>>}
   */
  async readTreeOids(treeOid) {
    validateOid(treeOid);
    if (treeOid === EMPTY_TREE_OID) {
      return {};
    }
    const entries = this._trees.get(treeOid);
    if (entries === undefined) {
      throw new PersistenceError(`Tree not found: ${treeOid}`, PersistenceError.E_MISSING_OBJECT);
    }
    /** @type {Record<string, string>} */
    const result = {};
    for (const e of entries) {
      result[e.path] = e.oid;
    }
    return result;
  }

  /**
   * Reads all blobs from a tree, returning a path-to-content map.
   * @param {string} treeOid
   * @returns {Promise<Record<string, Uint8Array>>}
   */
  async readTree(treeOid) {
    const oids = await this.readTreeOids(treeOid);
    /** @type {Record<string, Uint8Array>} */
    const files = {};
    for (const [path, oid] of Object.entries(oids)) {
      files[path] = await this.readBlob(oid);
    }
    return files;
  }

  // ── BlobPort ────────────────────────────────────────────────────────

  /**
   * Writes a blob and returns its content-addressed OID.
   * @param {Uint8Array|string} content
   * @returns {Promise<string>}
   */
  async writeBlob(content) {
    await this._cryptoReady;
    const bytes = toBytes(content);
    const oid = hashBlob(this._hash, bytes);
    this._blobs.set(oid, bytes);
    return oid;
  }

  /**
   * Reads a blob by its content-addressed OID.
   * @param {string} oid
   * @returns {Promise<Uint8Array>}
   */
  async readBlob(oid) {
    validateOid(oid);
    const buf = this._blobs.get(oid);
    if (buf === undefined) {
      throw new PersistenceError(`Blob not found: ${oid}`, PersistenceError.E_MISSING_OBJECT);
    }
    return buf;
  }

  // ── CommitPort ──────────────────────────────────────────────────────

  /**
   * Creates a commit pointing to the empty tree.
   * @param {{ message: string, parents?: string[], sign?: boolean }} options
   * @returns {Promise<string>}
   */
  async commitNode({ message, parents = [] }) {
    for (const p of parents) {
      validateOid(p);
    }
    return await this._createCommit(EMPTY_TREE_OID, parents, message);
  }

  /**
   * Creates a commit pointing to the specified tree OID.
   * @param {{ treeOid: string, parents?: string[], message: string, sign?: boolean }} options
   * @returns {Promise<string>}
   */
  async commitNodeWithTree({ treeOid, parents = [], message }) {
    validateOid(treeOid);
    for (const p of parents) {
      validateOid(p);
    }
    return await this._createCommit(treeOid, parents, message);
  }

  /**
   * Returns the commit message for a given SHA.
   * @param {string} sha
   * @returns {Promise<string>}
   */
  async showNode(sha) {
    validateOid(sha);
    const commit = this._commits.get(sha);
    if (commit === undefined) {
      throw new PersistenceError(`Commit not found: ${sha}`, PersistenceError.E_MISSING_OBJECT);
    }
    return commit.message;
  }

  /**
   * Returns full commit metadata for a given SHA.
   * @param {string} sha
   * @returns {Promise<{sha: string, message: string, author: string, date: string, parents: string[]}>}
   */
  async getNodeInfo(sha) {
    validateOid(sha);
    const commit = this._commits.get(sha);
    if (commit === undefined) {
      throw new PersistenceError(`Commit not found: ${sha}`, PersistenceError.E_MISSING_OBJECT);
    }
    return {
      sha,
      message: commit.message,
      author: commit.author,
      date: commit.date,
      parents: [...commit.parents],
    };
  }

  /**
   * Returns the tree OID associated with a commit.
   * @param {string} sha
   * @returns {Promise<string>}
   */
  async getCommitTree(sha) {
    validateOid(sha);
    const commit = this._commits.get(sha);
    if (commit === undefined) {
      throw new PersistenceError(`Commit not found: ${sha}`, PersistenceError.E_MISSING_OBJECT);
    }
    return commit.treeOid;
  }

  /**
   * Checks whether a commit exists in the store.
   * @param {string} sha
   * @returns {Promise<boolean>}
   */
  async nodeExists(sha) {
    validateOid(sha);
    return this._commits.has(sha);
  }

  /**
   * Counts all reachable commits from a ref by walking the DAG.
   * @param {string} ref
   * @returns {Promise<number>}
   */
  async countNodes(ref) {
    validateRef(ref);
    const tip = this._resolveRef(ref);
    if (tip === null) {
      throw new PersistenceError(`Ref not found: ${ref}`, PersistenceError.E_REF_NOT_FOUND);
    }
    return this._countReachable(tip);
  }

  /**
   * Returns formatted commit log output from a ref, newest first.
   * @param {{ ref: string, limit?: number, format?: string }} options
   * @returns {Promise<string>}
   */
  async logNodes({ ref, limit = 50, format: _format }) {
    validateRef(ref);
    validateLimit(limit);
    const records = this._walkLog(ref, limit);
    // Format param is accepted for port compatibility but always uses
    // the GitLogParser-compatible layout (SHA\nauthor\ndate\nparents\nmessage).
    if (typeof _format !== 'string' || _format.length === 0) {
      return records.map(c => `commit ${c.sha}\nAuthor: ${c.author}\nDate:   ${c.date}\n\n    ${c.message}\n`).join('\n');
    }
    return records.map(c => this._formatCommitRecord(c)).join('\0') + (records.length > 0 ? '\0' : '');
  }

  /**
   * Returns a readable stream of formatted commit log output.
   * @param {{ ref: string, limit?: number, format?: string }} options
   * @returns {Promise<import('node:stream').Readable>}
   */
  async logNodesStream({ ref, limit = 1000000, format: _format }) {
    validateRef(ref);
    validateLimit(limit);
    const records = this._walkLog(ref, limit);
    const formatted = records.map(c => this._formatCommitRecord(c)).join('\0') + (records.length > 0 ? '\0' : '');
    const { Readable } = await import('node:stream');
    return Readable.from([formatted]);
  }

  /**
   * Returns a successful health-check response with zero latency.
   * @returns {Promise<{ok: boolean, latencyMs: number}>}
   */
  async ping() {
    return { ok: true, latencyMs: 0 };
  }

  // ── RefPort ─────────────────────────────────────────────────────────

  /**
   * Sets a ref to point at the given OID.
   * @param {string} ref
   * @param {string} oid
   * @returns {Promise<void>}
   */
  async updateRef(ref, oid) {
    validateRef(ref);
    validateOid(oid);
    this._refs.set(ref, oid);
  }

  /**
   * Resolves a ref to its OID, or null if not found.
   * @param {string} ref
   * @returns {Promise<string|null>}
   */
  async readRef(ref) {
    validateRef(ref);
    return this._refs.get(ref) ?? null;
  }

  /**
   * Deletes a ref from the in-memory store.
   * @param {string} ref
   * @returns {Promise<void>}
   */
  async deleteRef(ref) {
    validateRef(ref);
    this._refs.delete(ref);
  }

  /**
   * Atomically updates a ref using compare-and-swap semantics.
   * @param {string} ref - The ref name
   * @param {string} newOid - The new OID to set
   * @param {string|null} expectedOid - Expected current OID, or null if ref must not exist
   * @returns {Promise<void>}
   * @throws {Error} If the ref does not match the expected value (CAS mismatch)
   */
  async compareAndSwapRef(ref, newOid, expectedOid) {
    validateRef(ref);
    validateOid(newOid);
    _validateExpectedOid(expectedOid);
    const current = this._refs.get(ref) ?? null;
    if (current !== expectedOid) {
      throw _casMismatchError(ref, expectedOid, current);
    }
    this._refs.set(ref, newOid);
  }

  /**
   * Lists all refs matching a prefix, sorted lexicographically.
   * @param {string} prefix
   * @param {{ limit?: number }} [options]
   * @returns {Promise<string[]>}
   */
  async listRefs(prefix, options) {
    validateRef(prefix);
    const sorted = this._filterRefsByPrefix(prefix);
    return _applyLimit(sorted, options?.limit);
  }

  // ── ConfigPort ──────────────────────────────────────────────────────

  /**
   * Reads a config value by key, or null if not set.
   * @param {string} key
   * @returns {Promise<string|null>}
   */
  async configGet(key) {
    validateConfigKey(key);
    return this._config.get(key) ?? null;
  }

  /**
   * Stores a config key-value pair.
   * @param {string} key
   * @param {string} value
   * @returns {Promise<void>}
   */
  async configSet(key, value) {
    validateConfigKey(key);
    if (typeof value !== 'string') {
      throw new WarpError('Config value must be a string', 'E_INVALID_INPUT');
    }
    this._config.set(key, value);
  }

  // ── Private helpers ─────────────────────────────────────────────────

  /**
   * Returns all refs whose names start with the given prefix, sorted.
   * @param {string} prefix
   * @returns {string[]}
   */
  _filterRefsByPrefix(prefix) {
    const result = [];
    for (const key of this._refs.keys()) {
      if (key.startsWith(prefix)) {
        result.push(key);
      }
    }
    return result.sort();
  }

  /**
   * Internal helper that hashes and stores a new commit object.
   * @param {string} treeOid
   * @param {string[]} parents
   * @param {string} message
   * @returns {Promise<string>}
   */
  async _createCommit(treeOid, parents, message) {
    await this._cryptoReady;
    const date = new Date(this._clock.now()).toISOString();
    const sha = hashCommit(this._hash, {
      treeOid,
      parents,
      message,
      author: this._author,
      date,
    });
    this._commits.set(sha, {
      treeOid,
      parents: [...parents],
      message,
      author: this._author,
      date,
    });
    return sha;
  }

  /**
   * Resolves a ref name to a SHA. If the ref looks like a raw SHA, returns it.
   * @param {string} ref
   * @returns {string|null}
   */
  _resolveRef(ref) {
    if (this._refs.has(ref)) {
      return /** @type {string} */ (this._refs.get(ref));
    }
    if (this._commits.has(ref)) {
      return ref;
    }
    return null;
  }

  /**
   * Walks commit history from a ref, reverse chronological (newest first),
   * up to limit. Matches `git log` default ordering for merge DAGs.
   * @param {string} ref
   * @param {number} limit
   * @returns {Array<{sha: string, message: string, author: string, date: string, parents: string[]}>}
   */
  _walkLog(ref, limit) {
    const tip = this._resolveRef(ref);
    if (tip === null) {
      return [];
    }
    const all = this._collectCommits(tip);
    all.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return all.slice(0, limit);
  }

  /**
   * Counts all commits reachable from a starting SHA via BFS.
   * @param {string} startSha
   * @returns {number}
   */
  _countReachable(startSha) {
    const visited = new Set();
    const stack = [startSha];
    while (stack.length > 0) {
      const sha = /** @type {string} */ (stack.pop());
      if (visited.has(sha)) {
        continue;
      }
      visited.add(sha);
      const commit = this._commits.get(sha);
      if (commit !== undefined) {
        for (const p of commit.parents) {
          stack.push(p);
        }
      }
    }
    return visited.size;
  }

  /**
   * Collects all commits reachable from a starting SHA via BFS.
   * @param {string} startSha
   * @returns {Array<{sha: string, message: string, author: string, date: string, parents: string[]}>}
   */
  _collectCommits(startSha) {
    /** @type {Array<{sha: string, message: string, author: string, date: string, parents: string[]}>} */
    const all = [];
    /** @type {Set<string>} */
    const visited = new Set();
    const queue = [startSha];
    let head = 0;
    while (head < queue.length) {
      const sha = /** @type {string} */ (queue[head++]);
      if (visited.has(sha)) {
        continue;
      }
      visited.add(sha);
      this._enqueueCommit(sha, { all, visited, queue });
    }
    return all;
  }

  /**
   * Processes a single commit SHA: pushes its record and enqueues parents.
   * @param {string} sha
   * @param {{ all: Array<{sha: string, message: string, author: string, date: string, parents: string[]}>, visited: Set<string>, queue: string[] }} ctx
   * @returns {void}
   */
  _enqueueCommit(sha, ctx) {
    const commit = this._commits.get(sha);
    if (commit === undefined) {
      return;
    }
    ctx.all.push({ sha, ...commit });
    for (const p of commit.parents) {
      if (!ctx.visited.has(p)) {
        ctx.queue.push(p);
      }
    }
  }

  /**
   * Formats a commit record in GitLogParser's expected format:
   * `<SHA>\n<author>\n<date>\n<parents>\n<message>`
   * @param {{sha: string, message: string, author: string, date: string, parents: string[]}} c
   * @returns {string}
   */
  _formatCommitRecord(c) {
    return `${c.sha}\n${c.author}\n${c.date}\n${c.parents.join(' ')}\n${c.message}`;
  }
}
