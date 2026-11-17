import { CasError, type AssetCapability, type PublicationCapability } from '@git-stunts/git-cas';
import ObservationSupportUnavailableError from '../../domain/errors/ObservationSupportUnavailableError.ts';
import WarpError from '../../domain/errors/WarpError.ts';
import type { ObservationSupportHistory } from './GitCasObservationSupportAdapter.ts';
import type { GitPlumbing } from './gitErrorClassification.ts';
import type { GitTreeObjectEntry } from './GitTreeObjectEntry.ts';
import { isTransientGitFailure } from './GitTransientFailure.ts';

/**
 * git-cas's code for a publication ref update that failed without a conflict, such as on a held
 * lock: the support step's form of `E_REF_IO`, which a retry can clear (#1109 decision D2).
 */
const TRANSIENT_CAS_CODE = 'PUBLICATION_REF_UPDATE_FAILED';

/** The Git and git-cas capabilities observation support is built with. */
export type ObservationSupportCapabilities = {
  readonly history: ObservationSupportHistory;
  readonly publications: Pick<PublicationCapability, 'commit'>;
  readonly assets: Pick<AssetCapability, 'put'>;
};

/**
 * Observation support's view of Git and git-cas (#1109), as `GitConeStoreHost` is the cone
 * store's (#1079). Every call goes through unchanged, including the plumbing calls of the
 * fast-import tree writer. Only a failure a retry can clear becomes an
 * `ObservationSupportUnavailableError` carrying that failure: one on the shared list
 * (`isTransientGitFailure`), or a git-cas `CasError` whose typed code is
 * `PUBLICATION_REF_UPDATE_FAILED`. Every other failure passes through as it is and rejects:
 * corruption, every other git-cas code (so a publication conflict still reaches the adapter
 * as one, and integrity errors stay corruption), a bare `GitProtocolError`, any other
 * plumbing failure, a defect, and an error this host cannot identify. An error that a writer
 * above this host creates is not seen here, so it rejects too.
 */
export default class GitObservationSupportHost implements ObservationSupportHistory {
  readonly plumbing: Pick<GitPlumbing, 'execute'>;
  readonly publications: Pick<PublicationCapability, 'commit'>;
  readonly assets: Pick<AssetCapability, 'put'>;
  readonly #history: ObservationSupportHistory;

  constructor({ history, publications, assets }: ObservationSupportCapabilities) {
    this.#history = history;
    this.plumbing = Object.freeze({
      execute: async (options: Parameters<GitPlumbing['execute']>[0]): Promise<string> =>
        await supportCall('run a Git process', async () => await history.plumbing.execute(options)),
    });
    this.publications = Object.freeze({
      commit: async (options: Parameters<PublicationCapability['commit']>[0]): ReturnType<PublicationCapability['commit']> =>
        await supportCall('publish a carrier commit', async () => await publications.commit(options)),
    });
    this.assets = Object.freeze({
      put: async (options: Parameters<AssetCapability['put']>[0]): ReturnType<AssetCapability['put']> =>
        await supportCall('stage a carrier root', async () => await assets.put(options)),
    });
    Object.freeze(this);
  }

  async readBlob(oid: string): Promise<Uint8Array> {
    return await supportCall('read a blob', async () => await this.#history.readBlob(oid));
  }

  async readTreeObjectEntries(treeOid: string): Promise<readonly GitTreeObjectEntry[]> {
    return await supportCall('read a tree', async () => await this.#history.readTreeObjectEntries(treeOid));
  }

  async readRef(ref: string): Promise<string | null> {
    return await supportCall('read a ref', async () => await this.#history.readRef(ref));
  }

  async deleteRef(ref: string): Promise<void> {
    await supportCall('delete a ref', async () => { await this.#history.deleteRef(ref); });
  }
}

async function supportCall<T>(operation: string, call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    throw classified(operation, error);
  }
}

function classified(operation: string, error: unknown): Error {
  if (!(error instanceof Error)) {
    return new WarpError(`The observation support host threw a non-error value while trying to ${operation}`, 'E_OBSERVATION_SUPPORT_HOST_DEFECT');
  }
  return isSupportTransient(error) ? new ObservationSupportUnavailableError(operation, error) : error;
}

/** Dispatches on git-cas's typed code, never on a message. */
function isSupportTransient(error: Error): boolean {
  return isTransientGitFailure(error) || (error instanceof CasError && error.code === TRANSIENT_CAS_CODE);
}
