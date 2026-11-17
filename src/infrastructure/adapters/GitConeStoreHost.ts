import ConeStoreUnavailableError from '../../domain/errors/ConeStoreUnavailableError.ts';
import WarpError from '../../domain/errors/WarpError.ts';
import type { ConeTrieHistory } from './GitConeRecordStoreAdapter.ts';
import type { GitPlumbing } from './gitErrorClassification.ts';
import type { GitTreeObjectEntry } from './GitTreeObjectEntry.ts';
import { isTransientGitFailure } from './GitTransientFailure.ts';

/**
 * The cone record store's view of its Git history (#1079). Every call goes to the
 * history unchanged. Only a failure this host can identify as transient
 * (`isTransientGitFailure`) becomes a `ConeStoreUnavailableError` carrying that
 * failure. Every other failure passes through as it is and rejects: corruption, every
 * git-cas code, a `GitProtocolError`, any other plumbing failure, a defect, and an error
 * it cannot identify.
 */
export default class GitConeStoreHost implements ConeTrieHistory {
  readonly plumbing: Pick<GitPlumbing, 'execute'>;
  readonly #history: ConeTrieHistory;

  constructor(history: ConeTrieHistory) {
    this.#history = history;
    this.plumbing = Object.freeze({
      execute: async (options: Parameters<GitPlumbing['execute']>[0]): Promise<string> =>
        await hostCall('run a Git process', async () => await history.plumbing.execute(options)),
    });
    Object.freeze(this);
  }

  async readBlob(oid: string): Promise<Uint8Array> {
    return await hostCall('read a blob', async () => await this.#history.readBlob(oid));
  }

  async readTreeObjectEntries(treeOid: string): Promise<readonly GitTreeObjectEntry[]> {
    return await hostCall('read a tree', async () => await this.#history.readTreeObjectEntries(treeOid));
  }

  async readRef(ref: string): Promise<string | null> {
    return await hostCall('read a ref', async () => await this.#history.readRef(ref));
  }

  async compareAndSwapRef(ref: string, newOid: string, expectedOid: string | null): Promise<void> {
    await hostCall('update a ref', async () => { await this.#history.compareAndSwapRef(ref, newOid, expectedOid); });
  }

  async deleteRef(ref: string): Promise<void> {
    await hostCall('delete a ref', async () => { await this.#history.deleteRef(ref); });
  }
}

async function hostCall<T>(operation: string, call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    throw classified(operation, error);
  }
}

/**
 * Unavailable is a positive verdict: only a listed transient failure earns it. The
 * history adapter already turns a thrown non-error into a typed failure
 * (`toGitError`), so the non-error branch guards only another history implementation.
 */
function classified(operation: string, error: unknown): Error {
  if (!(error instanceof Error)) {
    return new WarpError(`The cone store host threw a non-error value while trying to ${operation}`, 'E_CONE_STORE_HOST_DEFECT');
  }
  return isTransientGitFailure(error) ? new ConeStoreUnavailableError(operation, error) : error;
}
