import ConeStoreUnavailableError from '../../domain/errors/ConeStoreUnavailableError.ts';
import WarpError from '../../domain/errors/WarpError.ts';
import type { ConeTrieHistory } from './GitConeRecordStoreAdapter.ts';
import type { GitPlumbing } from './gitErrorClassification.ts';
import type { GitTreeObjectEntry } from './GitTreeObjectEntry.ts';

/** Errors a defect throws, which no retry can mend. */
const DEFECTS = Object.freeze([TypeError, RangeError, ReferenceError, SyntaxError]);

/**
 * The cone record store's view of its Git history (#1079). Every call goes to the
 * history unchanged; a failure of the host or of a Git process beneath it becomes
 * a `ConeStoreUnavailableError` carrying that failure. Typed failures (corruption,
 * a missing object) and defects pass through as they are, so they still reject.
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

/** Only an untyped host error is an unavailable store; a thrown non-error is a defect. */
function classified(operation: string, error: unknown): Error {
  if (!(error instanceof Error)) {
    return new WarpError(`The cone store host threw a non-error value while trying to ${operation}`, 'E_CONE_STORE_HOST_DEFECT');
  }
  if (error instanceof WarpError || DEFECTS.some((defect) => error instanceof defect)) {
    return error;
  }
  return new ConeStoreUnavailableError(operation, error);
}
