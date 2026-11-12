import AdapterValidationError from '../../domain/errors/AdapterValidationError.ts';
import type { WritePublicationHistory } from '../../domain/services/write/WritePublicationProbe.ts';
import type { LogNodesOptions, NodeInfo } from '../../ports/CommitPort.ts';

const COMMIT_ID = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u;

/** The Git surface a publication probe reads through. */
export type WriterChainHistory = {
  readRef(ref: string): Promise<string | null>;
  getNodeInfo(sha: string): Promise<NodeInfo>;
  logNodes(options: LogNodesOptions): Promise<string>;
};

/**
 * Gives a publication probe a writer's chain (#1075): a range of first parents comes
 * from one `git log`, not one process per commit, so a probe costs one Git process,
 * whatever the depth. Git may still walk the whole range inside that process (#1158).
 */
export default class GitWritePublicationHistoryAdapter implements WritePublicationHistory {
  readonly #history: WriterChainHistory;

  constructor(history: WriterChainHistory) {
    this.#history = history;
    Object.freeze(this);
  }

  async readRef(ref: string): Promise<string | null> {
    return await this.#history.readRef(ref);
  }

  async getNodeInfo(sha: string): Promise<NodeInfo> {
    return await this.#history.getNodeInfo(sha);
  }

  async firstParentsSince(range: { readonly tip: string; readonly stopAt: string | null; readonly limit: number }): Promise<readonly string[]> {
    const { tip, stopAt, limit } = range;
    const output = await this.#history.logNodes({ ref: tip, ...(stopAt === null ? {} : { stopAt }), firstParent: true, limit, format: '%H' });
    return Object.freeze(output.split('\n').filter((line) => line !== '').map(commitId));
  }
}

function commitId(line: string): string {
  if (!COMMIT_ID.test(line)) {
    throw new AdapterValidationError('A writer chain listing named something that is not a commit id');
  }
  return line;
}
