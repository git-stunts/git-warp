import ObservationDigest from '../../domain/services/custody/ObservationDigest.ts';
import type ObservationDependency from '../../domain/services/custody/ObservationDependency.ts';
import ObservationSupportCancelled from '../../domain/services/custody/ObservationSupportCancelled.ts';
import ObservationSupportRefused from '../../domain/services/custody/ObservationSupportRefused.ts';
import type { ObservationSupportRequest } from '../../domain/services/custody/ObservationSupportRequest.ts';
import type CryptoPort from '../../ports/CryptoPort.ts';
import GitFastImportTreeScript from './GitFastImportTreeScript.ts';
import type GitFastImportTreeWriter from './GitFastImportTreeWriter.ts';
import type { GitTreeObjectEntry } from './GitTreeObjectEntry.ts';

/** Dependency entries per page tree. */
export const OBSERVATION_DEPENDENCY_PAGE = 1024;
/** Page trees per attempt: custody evidence allows 64 supports, and the basis tree is one. */
export const OBSERVATION_DEPENDENCY_PAGES = 63;
const DEPENDENCY_DOMAIN = 'git-warp/observation-dependencies';
const ENTRY_NAME_DIGITS = 8;
const HASH_ALGORITHM = 'sha256';

export type ObservationDependencyHistory = {
  nodeExists(oid: string): Promise<boolean>;
  readTreeObjectEntries(treeOid: string): Promise<readonly GitTreeObjectEntry[]>;
};

export type ObservationPageSet = {
  readonly pages: readonly string[];
  readonly count: number;
  readonly digest: ObservationDigest;
};

/**
 * Retains dependency objects through bounded page trees, each a custody support.
 * Working memory holds one page, and pages are content-addressed, so a rebuilt
 * attempt reproduces the same supports.
 */
export default class ObservationDependencyPages {
  readonly #history: ObservationDependencyHistory;
  readonly #trees: GitFastImportTreeWriter;
  readonly #crypto: CryptoPort;

  constructor(options: {
    readonly history: ObservationDependencyHistory;
    readonly trees: GitFastImportTreeWriter;
    readonly crypto: CryptoPort;
  }) {
    this.#history = options.history;
    this.#trees = options.trees;
    this.#crypto = options.crypto;
    Object.freeze(this);
  }

  async write(
    request: ObservationSupportRequest,
  ): Promise<ObservationPageSet | ObservationSupportRefused | ObservationSupportCancelled> {
    let state: ObservationPageSet = { pages: [], count: 0, digest: await this.#seed() };
    let batch: ObservationDependency[] = [];
    for await (const dependency of request.dependencies) {
      const stopped = stopOf(request, state.count + 1);
      if (stopped !== null) {
        return stopped;
      }
      batch.push(dependency);
      state = { ...state, count: state.count + 1 };
      if (batch.length === OBSERVATION_DEPENDENCY_PAGE) {
        const flushed = await this.#flush(state, batch);
        if (flushed instanceof ObservationSupportRefused) {
          return flushed;
        }
        state = flushed;
        batch = [];
      }
    }
    return await this.#flush(state, batch);
  }

  /** The first problem with retained pages against their claim: missing, mismatched, or null. */
  async check(
    pages: readonly string[],
    claim: { readonly count: number; readonly digest: ObservationDigest },
  ): Promise<'dependency-missing' | 'dependency-mismatch' | null> {
    let digest = await this.#seed();
    let count = 0;
    for (const page of pages) {
      const lines = await this.#pageLines(page);
      if (lines === null) {
        return 'dependency-missing';
      }
      digest = await this.#extend(digest, lines);
      count += lines.length;
    }
    return count === claim.count && digest.equals(claim.digest) ? null : 'dependency-mismatch';
  }

  async #flush(
    state: ObservationPageSet,
    batch: readonly ObservationDependency[],
  ): Promise<ObservationPageSet | ObservationSupportRefused> {
    if (batch.length === 0) {
      return state;
    }
    const page = await this.#writePage(batch);
    if (page === null) {
      return new ObservationSupportRefused('dependency-unavailable');
    }
    const lines = batch.map((dependency) => `${dependency.type} ${dependency.oid}`);
    return { pages: [...state.pages, page], count: state.count, digest: await this.#extend(state.digest, lines) };
  }

  /** One page tree of dependency edges, or null when Git refuses a missing object. */
  async #writePage(batch: readonly ObservationDependency[]): Promise<string | null> {
    const script = new GitFastImportTreeScript();
    batch.forEach((dependency, index) => placeEntry(script, dependency, index));
    try {
      return await this.#trees.write(script);
    } catch {
      return null;
    }
  }

  /** A page's dependency lines in order, or null when the page or any entry is gone. */
  async #pageLines(oid: string): Promise<readonly string[] | null> {
    if (!await this.#history.nodeExists(oid)) {
      return null;
    }
    const entries = [...await this.#history.readTreeObjectEntries(oid)]
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (!await this.#history.nodeExists(entry.oid)) {
        return null;
      }
    }
    return entries.map((entry) => `${entry.type} ${entry.oid}`);
  }

  async #seed(): Promise<ObservationDigest> {
    return new ObservationDigest(await this.#crypto.hash(HASH_ALGORITHM, `${DEPENDENCY_DOMAIN}\n`));
  }

  async #extend(previous: ObservationDigest, lines: readonly string[]): Promise<ObservationDigest> {
    return new ObservationDigest(await this.#crypto.hash(HASH_ALGORITHM, [previous.hex, ...lines, ''].join('\n')));
  }
}

function stopOf(request: ObservationSupportRequest, count: number): ObservationSupportRefused | ObservationSupportCancelled | null {
  if (request.isCancelled()) {
    return new ObservationSupportCancelled();
  }
  const limit = Math.min(request.limits.dependencies, OBSERVATION_DEPENDENCY_PAGE * OBSERVATION_DEPENDENCY_PAGES);
  return count > limit ? new ObservationSupportRefused('dependency-limit') : null;
}

function placeEntry(script: GitFastImportTreeScript, dependency: ObservationDependency, index: number): void {
  const name = String(index).padStart(ENTRY_NAME_DIGITS, '0');
  if (dependency.type === 'tree') {
    script.graft(name, dependency.oid);
  } else {
    script.link(name, dependency.oid);
  }
}
