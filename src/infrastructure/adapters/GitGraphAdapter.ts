/**
 * Git-backed persistence adapter for WARP graph storage.
 *
 * Translates graph operations into Git plumbing commands. Implements the
 * composite GraphPersistencePort (CommitPort + BlobPort + TreePort +
 * RefPort + ConfigPort).
 */
import { retry, type RetryOptions } from '@git-stunts/alfred';
import type { CommitLogChunk, CommitNodeOptions, CommitNodeWithTreeOptions, LogNodesOptions, NodeInfo, PingResult } from '../../ports/CommitPort.ts';
import type { ListRefsOptions } from '../../ports/RefPort.ts';
import AdapterValidationError from '../../domain/errors/AdapterValidationError.ts';
import PersistenceError from '../../domain/errors/PersistenceError.ts';
import GraphPersistencePort from '../../ports/GraphPersistencePort.ts';
import WarpStream from '../../domain/stream/WarpStream.ts';
import { validateOid, validateRef, validateLimit, validateConfigKey } from './adapterValidation.ts';
import {
  type GitPlumbing,
  type GitError,
  getExitCode,
  isDanglingObjectError,
  gitDiagnosticText,
  wrapGitError,
  toGitError,
  DEFAULT_RETRY_OPTIONS,
} from './gitErrorClassification.ts';

// Re-export for downstream consumers that reference these types via the adapter module.
export type { GitPlumbing, GitError } from './gitErrorClassification.ts';
export type { CollectableStream } from './gitErrorClassification.ts';

interface GitGraphAdapterOptions {
  readonly plumbing: GitPlumbing;
  readonly retryOptions?: Partial<RetryOptions>;
}

export default class GitGraphAdapter extends GraphPersistencePort {
  private readonly plumbing: GitPlumbing;
  private readonly _retryOptions: RetryOptions;

  constructor({ plumbing, retryOptions = {} }: GitGraphAdapterOptions) {
    super();
    if (plumbing === null || plumbing === undefined) {
      throw new AdapterValidationError('plumbing is required');
    }
    this.plumbing = plumbing;
    this._retryOptions = { ...DEFAULT_RETRY_OPTIONS, ...retryOptions };
  }

  private async _executeWithRetry(options: { args: string[]; input?: string | Buffer }): Promise<string> {
    return await retry(() => this.plumbing.execute(options), this._retryOptions);
  }

  /**
   * Distinguishes a legitimate zero-byte blob from a missing object when a
   * blob stream returns no bytes.
   */
  private async _assertBlobExistsForEmptyRead(oid: string): Promise<void> {
    try {
      await this._executeWithRetry({ args: ['cat-file', '-e', oid] });
    } catch (raw) {
      const err = toGitError(raw);
      const wrapped = wrapGitError(err, { oid });
      const exitCode = getExitCode(err);
      const diagnostics = gitDiagnosticText(err);
      const ambiguousMissingObject = exitCode === 1 && diagnostics === '';
      if (wrapped === err && ambiguousMissingObject) {
        throw new PersistenceError(
          `Missing Git object: ${oid}`,
          PersistenceError.E_MISSING_OBJECT,
          { cause: err, context: { oid } },
        );
      }
      throw wrapped;
    }
  }

  get emptyTree(): string {
    return this.plumbing.emptyTree;
  }

  private async _createCommit(opts: {
    tree: string;
    parents: string[];
    message: string;
    sign: boolean;
  }): Promise<string> {
    for (const p of opts.parents) {
      validateOid(p);
    }
    const parentArgs = opts.parents.flatMap(p => ['-p', p]);
    const signArgs = opts.sign ? ['-S'] : [];
    const args = ['commit-tree', opts.tree, ...parentArgs, ...signArgs, '-m', opts.message];
    const oid = await this._executeWithRetry({ args });
    return oid.trim();
  }

  async commitNode({ message, parents = [], sign = false }: CommitNodeOptions): Promise<string> {
    return await this._createCommit({ tree: this.emptyTree, parents, message, sign });
  }

  async commitNodeWithTree({ treeOid, parents = [], message, sign = false }: CommitNodeWithTreeOptions): Promise<string> {
    validateOid(treeOid);
    return await this._createCommit({ tree: treeOid, parents, message, sign });
  }

  async showNode(sha: string): Promise<string> {
    validateOid(sha);
    try {
      return await this._executeWithRetry({ args: ['show', '-s', '--format=%B', sha] });
    } catch (raw) {
      throw wrapGitError(toGitError(raw), { oid: sha });
    }
  }

  async getNodeInfo(sha: string): Promise<NodeInfo> {
    validateOid(sha);
    const format = '%H%x00%an <%ae>%x00%aI%x00%P%x00%B';
    let output: string;
    try {
      output = await this._executeWithRetry({ args: ['show', '-s', `--format=${format}`, sha] });
    } catch (raw) {
      throw wrapGitError(toGitError(raw), { oid: sha });
    }

    const parts = output.split('\x00');
    if (parts.length < 5) {
      throw new PersistenceError(
        `Invalid commit format for SHA ${sha}`,
        PersistenceError.E_MISSING_OBJECT,
        { context: { oid: sha } },
      );
    }

    const [commitSha, author, date, parentsStr, ...messageParts] = parts;
    const message = messageParts.join('\x00');
    const parents = (parentsStr !== undefined && parentsStr.length > 0) ? parentsStr.split(' ').filter(p => p !== '') : [];
    return {
      sha: (commitSha ?? '').trim(),
      message,
      author: (author ?? '').trim(),
      date: (date ?? '').trim(),
      parents,
    };
  }

  async getCommitTree(sha: string): Promise<string> {
    validateOid(sha);
    try {
      const output = await this._executeWithRetry({ args: ['rev-parse', `${sha}^{tree}`] });
      return output.trim();
    } catch (raw) {
      throw wrapGitError(toGitError(raw), { oid: sha });
    }
  }

  async logNodes({ ref, limit = 50, format }: LogNodesOptions): Promise<string> {
    validateRef(ref);
    validateLimit(limit);
    const args = ['log', `-${limit}`];
    if (typeof format === 'string' && format.length > 0) {
      args.push(`--format=${format}`);
    }
    args.push(ref);
    try {
      return await this._executeWithRetry({ args });
    } catch (raw) {
      throw wrapGitError(toGitError(raw), { ref });
    }
  }

  async logNodesStream({ ref, limit = 1000000, format }: LogNodesOptions): Promise<WarpStream<CommitLogChunk>> {
    validateRef(ref);
    validateLimit(limit);
    const args = ['log', '-z', `-${limit}`];
    if (typeof format === 'string' && format.length > 0) {
      // Strip NUL bytes — Git -z uses NUL as record terminator.
      // eslint-disable-next-line no-control-regex
      const cleanFormat = format.replace(/\x00/g, '');
      args.push(`--format=${cleanFormat}`);
    }
    args.push(ref);
    const rawStream = await this.plumbing.executeStream({ args });
    return WarpStream.from<CommitLogChunk>(rawStream);
  }

  async writeBlob(content: Uint8Array | string): Promise<string> {
    const oid = await this._executeWithRetry({
      args: ['hash-object', '-w', '--stdin'],
      input: content as string | Buffer,
    });
    return oid.trim();
  }

  async writeTree(entries: string[]): Promise<string> {
    const oid = await this._executeWithRetry({
      args: ['mktree'],
      input: `${entries.join('\n')}\n`,
    });
    return oid.trim();
  }

  async readTree(treeOid: string): Promise<Record<string, Uint8Array>> {
    const oids = await this.readTreeOids(treeOid);
    const files: Record<string, Uint8Array> = {};
    const entries = Object.entries(oids);
    const BATCH_SIZE = 16;
    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = entries.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(batch.map(([, oid]) => this.readBlob(oid)));
      for (let j = 0; j < batch.length; j++) {
        const entry = batch[j];
        const result = results[j];
        if (entry !== null && entry !== undefined && result !== null && result !== undefined) {
          files[entry[0]] = result;
        }
      }
    }
    return files;
  }

  async readTreeOids(treeOid: string): Promise<Record<string, string>> {
    validateOid(treeOid);
    let output: string;
    try {
      output = await this._executeWithRetry({ args: ['ls-tree', '-r', '-z', treeOid] });
    } catch (raw) {
      throw wrapGitError(toGitError(raw), { oid: treeOid });
    }
    const oids: Record<string, string> = {};
    for (const record of output.split('\0')) {
      if (record === '') {
        continue;
      }
      const tabIndex = record.indexOf('\t');
      if (tabIndex === -1) {
        continue;
      }
      const meta = record.slice(0, tabIndex);
      const path = record.slice(tabIndex + 1);
      const [, , oid] = meta.split(' ');
      oids[path] = oid ?? '';
    }
    return oids;
  }

  async readBlob(oid: string): Promise<Uint8Array> {
    validateOid(oid);
    try {
      const stream = await this.plumbing.executeStream({ args: ['cat-file', 'blob', oid] });
      const raw = await stream.collect({ asString: false });
      if ((raw as Uint8Array).length === 0) {
        await this._assertBlobExistsForEmptyRead(oid);
      }
      return raw as Uint8Array;
    } catch (raw) {
      throw wrapGitError(toGitError(raw), { oid });
    }
  }

  async updateRef(ref: string, oid: string): Promise<void> {
    validateRef(ref);
    validateOid(oid);
    try {
      await this._executeWithRetry({ args: ['update-ref', ref, oid] });
    } catch (raw) {
      throw wrapGitError(toGitError(raw), { ref, oid });
    }
  }

  async readRef(ref: string): Promise<string | null> {
    validateRef(ref);
    try {
      const oid = await this._executeWithRetry({ args: ['rev-parse', '--verify', '--quiet', ref] });
      return oid.trim();
    } catch (raw) {
      const err = toGitError(raw);
      if (getExitCode(err) === 1) {
        return null;
      }
      if (isDanglingObjectError(err)) {
        return null;
      }
      throw wrapGitError(err, { ref });
    }
  }

  async compareAndSwapRef(ref: string, newOid: string, expectedOid: string | null): Promise<void> {
    validateRef(ref);
    validateOid(newOid);
    const oldArg = expectedOid ?? '0'.repeat(40);
    if (expectedOid !== null && expectedOid !== undefined) {
      validateOid(expectedOid);
    }
    // Direct call — CAS failures must NOT be retried.
    try {
      await this.plumbing.execute({ args: ['update-ref', ref, newOid, oldArg] });
    } catch (raw) {
      throw wrapGitError(toGitError(raw), { ref, oid: newOid });
    }
  }

  async deleteRef(ref: string): Promise<void> {
    validateRef(ref);
    try {
      await this._executeWithRetry({ args: ['update-ref', '-d', ref] });
    } catch (raw) {
      throw wrapGitError(toGitError(raw), { ref });
    }
  }

  async nodeExists(sha: string): Promise<boolean> {
    validateOid(sha);
    try {
      await this._executeWithRetry({ args: ['cat-file', '-e', sha] });
      return true;
    } catch (raw) {
      if (getExitCode(toGitError(raw)) === 1) {
        return false;
      }
      throw raw;
    }
  }

  async listRefs(prefix: string, options?: ListRefsOptions): Promise<string[]> {
    validateRef(prefix);
    const limit = options?.limit;
    const args = ['for-each-ref', '--format=%(refname)'];
    if (limit !== null && limit !== undefined && limit !== 0) {
      validateLimit(limit);
      args.push(`--count=${limit}`);
    }
    args.push(prefix);
    let output: string;
    try {
      output = await this._executeWithRetry({ args });
    } catch (raw) {
      throw wrapGitError(toGitError(raw), { ref: prefix });
    }
    return output.split('\n').filter(line => line.trim() !== '');
  }

  async ping(): Promise<PingResult> {
    const start = Date.now();
    try {
      await this._executeWithRetry({ args: ['rev-parse', '--is-inside-work-tree'] });
      return { ok: true, latencyMs: Date.now() - start };
    } catch {
      return { ok: false, latencyMs: Date.now() - start };
    }
  }

  async countNodes(ref: string): Promise<number> {
    validateRef(ref);
    try {
      const output = await this._executeWithRetry({ args: ['rev-list', '--count', ref] });
      return parseInt(output.trim(), 10);
    } catch (raw) {
      throw wrapGitError(toGitError(raw), { ref });
    }
  }

  async isAncestor(potentialAncestor: string, descendant: string): Promise<boolean> {
    validateOid(potentialAncestor);
    validateOid(descendant);
    try {
      await this._executeWithRetry({
        args: ['merge-base', '--is-ancestor', potentialAncestor, descendant],
      });
      return true;
    } catch (raw) {
      if (getExitCode(toGitError(raw)) === 1) {
        return false;
      }
      throw raw;
    }
  }

  async configGet(key: string): Promise<string | null> {
    validateConfigKey(key);
    try {
      const value = await this._executeWithRetry({ args: ['config', '--get', key] });
      return value.replace(/\n$/, '');
    } catch (raw) {
      if (this._isConfigKeyNotFound(toGitError(raw))) {
        return null;
      }
      throw raw;
    }
  }

  async configSet(key: string, value: string): Promise<void> {
    validateConfigKey(key);
    if (typeof value !== 'string') {
      throw new AdapterValidationError('Config value must be a string');
    }
    await this._executeWithRetry({ args: ['config', key, value] });
  }

  private _isConfigKeyNotFound(err: GitError): boolean {
    return getExitCode(err) === 1;
  }
}
