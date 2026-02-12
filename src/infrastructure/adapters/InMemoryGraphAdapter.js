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
 * @module infrastructure/adapters/InMemoryGraphAdapter
 */

import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import GraphPersistencePort from '../../ports/GraphPersistencePort.js';
import { validateOid, validateRef, validateLimit, validateConfigKey } from './adapterValidation.js';

/** Well-known SHA for Git's empty tree. */
const EMPTY_TREE_OID = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

// ── SHA helpers ─────────────────────────────────────────────────────────

/**
 * Computes a Git blob SHA-1: `SHA1("blob " + len + "\0" + content)`.
 * @param {Buffer} content
 * @returns {string} 40-hex SHA
 */
function hashBlob(content) {
  const header = Buffer.from(`blob ${content.length}\0`);
  return createHash('sha1').update(header).update(content).digest('hex');
}

/**
 * Builds the binary tree buffer in Git's internal format and hashes it.
 *
 * Each entry is: `<mode> <path>\0<20-byte binary OID>`
 * Entries are sorted by path (byte order), matching Git's canonical sort.
 *
 * @param {Array<{mode: string, path: string, oid: string}>} entries
 * @returns {string} 40-hex SHA
 */
function hashTree(entries) {
  const sorted = [...entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const parts = sorted.map(e => {
    const prefix = Buffer.from(`${e.mode} ${e.path}\0`);
    const oidBin = Buffer.from(e.oid, 'hex');
    return Buffer.concat([prefix, oidBin]);
  });
  const body = Buffer.concat(parts);
  const header = Buffer.from(`tree ${body.length}\0`);
  return createHash('sha1').update(header).update(body).digest('hex');
}

/**
 * Builds a Git-style commit string and hashes it.
 * @param {{treeOid: string, parents: string[], message: string, author: string, date: string}} opts
 * @returns {string} 40-hex SHA
 */
function hashCommit({ treeOid, parents, message, author, date }) {
  const lines = [`tree ${treeOid}`];
  for (const p of parents) {
    lines.push(`parent ${p}`);
  }
  lines.push(`author ${author} ${date}`);
  lines.push(`committer ${author} ${date}`);
  lines.push('');
  lines.push(message);
  const body = lines.join('\n');
  const header = `commit ${Buffer.byteLength(body)}\0`;
  return createHash('sha1').update(header).update(body).digest('hex');
}

// ── Adapter ─────────────────────────────────────────────────────────────

/**
 * In-memory implementation of {@link GraphPersistencePort}.
 *
 * Data structures:
 * - `_commits` — Map<sha, {treeOid, parents[], message, author, date}>
 * - `_blobs`   — Map<oid, Buffer>
 * - `_trees`   — Map<oid, Array<{mode, path, oid}>>
 * - `_refs`    — Map<refName, sha>
 * - `_config`  — Map<key, value>
 *
 * @extends GraphPersistencePort
 */
export default class InMemoryGraphAdapter extends GraphPersistencePort {
  /**
   * @param {{ author?: string, clock?: { now: () => number } }} [options]
   */
  constructor({ author, clock } = {}) {
    super();
    this._author = author || 'InMemory <inmemory@test>';
    this._clock = clock || { now: () => Date.now() };

    /** @type {Map<string, {treeOid: string, parents: string[], message: string, author: string, date: string}>} */
    this._commits = new Map();
    /** @type {Map<string, Buffer>} */
    this._blobs = new Map();
    /** @type {Map<string, Array<{mode: string, path: string, oid: string}>>} */
    this._trees = new Map();
    /** @type {Map<string, string>} */
    this._refs = new Map();
    /** @type {Map<string, string>} */
    this._config = new Map();
  }

  // ── TreePort ────────────────────────────────────────────────────────

  /** @type {string} */
  get emptyTree() {
    return EMPTY_TREE_OID;
  }

  /**
   * Creates a tree from mktree-formatted entries.
   * @param {string[]} entries - Lines in `"<mode> <type> <oid>\t<path>"` format
   * @returns {Promise<string>}
   */
  async writeTree(entries) {
    const parsed = entries.map(line => {
      const tabIdx = line.indexOf('\t');
      if (tabIdx === -1) {
        throw new Error(`Invalid mktree entry (missing tab): ${line}`);
      }
      const meta = line.slice(0, tabIdx);
      const path = line.slice(tabIdx + 1);
      const [mode, , oid] = meta.split(' ');
      return { mode, path, oid };
    });
    const oid = hashTree(parsed);
    this._trees.set(oid, parsed);
    return oid;
  }

  /**
   * @param {string} treeOid
   * @returns {Promise<Record<string, string>>}
   */
  async readTreeOids(treeOid) {
    validateOid(treeOid);
    if (treeOid === EMPTY_TREE_OID) {
      return {};
    }
    const entries = this._trees.get(treeOid);
    if (!entries) {
      throw new Error(`Tree not found: ${treeOid}`);
    }
    /** @type {Record<string, string>} */
    const result = {};
    for (const e of entries) {
      result[e.path] = e.oid;
    }
    return result;
  }

  /**
   * @param {string} treeOid
   * @returns {Promise<Record<string, Buffer>>}
   */
  async readTree(treeOid) {
    const oids = await this.readTreeOids(treeOid);
    /** @type {Record<string, Buffer>} */
    const files = {};
    for (const [path, oid] of Object.entries(oids)) {
      files[path] = await this.readBlob(oid);
    }
    return files;
  }

  // ── BlobPort ────────────────────────────────────────────────────────

  /**
   * @param {Buffer|string} content
   * @returns {Promise<string>}
   */
  async writeBlob(content) {
    const buf = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const oid = hashBlob(buf);
    this._blobs.set(oid, buf);
    return oid;
  }

  /**
   * @param {string} oid
   * @returns {Promise<Buffer>}
   */
  async readBlob(oid) {
    validateOid(oid);
    const buf = this._blobs.get(oid);
    if (!buf) {
      throw new Error(`Blob not found: ${oid}`);
    }
    return buf;
  }

  // ── CommitPort ──────────────────────────────────────────────────────

  /**
   * @param {{ message: string, parents?: string[], sign?: boolean }} options
   * @returns {Promise<string>}
   */
  async commitNode({ message, parents = [] }) {
    for (const p of parents) {
      validateOid(p);
    }
    return this._createCommit(EMPTY_TREE_OID, parents, message);
  }

  /**
   * @param {{ treeOid: string, parents?: string[], message: string, sign?: boolean }} options
   * @returns {Promise<string>}
   */
  async commitNodeWithTree({ treeOid, parents = [], message }) {
    validateOid(treeOid);
    for (const p of parents) {
      validateOid(p);
    }
    return this._createCommit(treeOid, parents, message);
  }

  /**
   * @param {string} sha
   * @returns {Promise<string>}
   */
  async showNode(sha) {
    validateOid(sha);
    const commit = this._commits.get(sha);
    if (!commit) {
      throw new Error(`Commit not found: ${sha}`);
    }
    return commit.message;
  }

  /**
   * @param {string} sha
   * @returns {Promise<{sha: string, message: string, author: string, date: string, parents: string[]}>}
   */
  async getNodeInfo(sha) {
    validateOid(sha);
    const commit = this._commits.get(sha);
    if (!commit) {
      throw new Error(`Commit not found: ${sha}`);
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
   * @param {string} sha
   * @returns {Promise<boolean>}
   */
  async nodeExists(sha) {
    validateOid(sha);
    return this._commits.has(sha);
  }

  /**
   * @param {string} ref
   * @returns {Promise<number>}
   */
  async countNodes(ref) {
    validateRef(ref);
    const tip = this._resolveRef(ref);
    if (!tip) {
      throw new Error(`Ref not found: ${ref}`);
    }
    const visited = new Set();
    const stack = [tip];
    while (stack.length > 0) {
      const sha = /** @type {string} */ (stack.pop());
      if (visited.has(sha)) {
        continue;
      }
      visited.add(sha);
      const commit = this._commits.get(sha);
      if (commit) {
        for (const p of commit.parents) {
          stack.push(p);
        }
      }
    }
    return visited.size;
  }

  /**
   * @param {{ ref: string, limit?: number, format?: string }} options
   * @returns {Promise<string>}
   */
  async logNodes({ ref, limit = 50, format: _format }) {
    validateRef(ref);
    validateLimit(limit);
    const records = this._walkLog(ref, limit);
    // Format param is accepted for port compatibility but always uses
    // the GitLogParser-compatible layout (SHA\nauthor\ndate\nparents\nmessage).
    if (!_format) {
      return records.map(c => `commit ${c.sha}\nAuthor: ${c.author}\nDate:   ${c.date}\n\n    ${c.message}\n`).join('\n');
    }
    return records.map(c => this._formatCommitRecord(c)).join('\0') + (records.length > 0 ? '\0' : '');
  }

  /**
   * @param {{ ref: string, limit?: number, format?: string }} options
   * @returns {Promise<Readable>}
   */
  async logNodesStream({ ref, limit = 1000000, format: _format }) {
    validateRef(ref);
    validateLimit(limit);
    const records = this._walkLog(ref, limit);
    const formatted = records.map(c => this._formatCommitRecord(c)).join('\0') + (records.length > 0 ? '\0' : '');
    return Readable.from([formatted]);
  }

  /**
   * @returns {Promise<{ok: boolean, latencyMs: number}>}
   */
  async ping() {
    return { ok: true, latencyMs: 0 };
  }

  // ── RefPort ─────────────────────────────────────────────────────────

  /**
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
   * @param {string} ref
   * @returns {Promise<string|null>}
   */
  async readRef(ref) {
    validateRef(ref);
    return this._refs.get(ref) || null;
  }

  /**
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
    if (expectedOid) {
      validateOid(expectedOid);
    }
    const current = this._refs.get(ref) || null;
    if (current !== expectedOid) {
      throw new Error(
        `CAS mismatch on ${ref}: expected ${expectedOid || '(none)'}, got ${current || '(none)'}`,
      );
    }
    this._refs.set(ref, newOid);
  }

  /**
   * @param {string} prefix
   * @returns {Promise<string[]>}
   */
  async listRefs(prefix) {
    validateRef(prefix);
    const result = [];
    for (const key of this._refs.keys()) {
      if (key.startsWith(prefix)) {
        result.push(key);
      }
    }
    return result.sort();
  }

  // ── ConfigPort ──────────────────────────────────────────────────────

  /**
   * @param {string} key
   * @returns {Promise<string|null>}
   */
  async configGet(key) {
    validateConfigKey(key);
    return this._config.get(key) ?? null;
  }

  /**
   * @param {string} key
   * @param {string} value
   * @returns {Promise<void>}
   */
  async configSet(key, value) {
    validateConfigKey(key);
    if (typeof value !== 'string') {
      throw new Error('Config value must be a string');
    }
    this._config.set(key, value);
  }

  // ── Private helpers ─────────────────────────────────────────────────

  /**
   * @param {string} treeOid
   * @param {string[]} parents
   * @param {string} message
   * @returns {string}
   */
  _createCommit(treeOid, parents, message) {
    const date = new Date(this._clock.now()).toISOString();
    const sha = hashCommit({
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
    if (!tip) {
      return [];
    }
    /** @type {Array<{sha: string, message: string, author: string, date: string, parents: string[]}>} */
    const all = [];
    const visited = new Set();
    const queue = [tip];
    let head = 0;
    while (head < queue.length) {
      const sha = /** @type {string} */ (queue[head++]);
      if (visited.has(sha)) {
        continue;
      }
      visited.add(sha);
      const commit = this._commits.get(sha);
      if (!commit) {
        continue;
      }
      all.push({ sha, ...commit });
      for (const p of commit.parents) {
        if (!visited.has(p)) {
          queue.push(p);
        }
      }
    }
    // Sort by date descending (reverse chronological), matching git log
    all.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return all.slice(0, limit);
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
