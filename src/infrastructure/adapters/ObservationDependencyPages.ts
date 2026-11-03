import type ObservationDependency from '../../domain/services/custody/ObservationDependency.ts';
import ObservationDependencyClaim from '../../domain/services/custody/ObservationDependencyClaim.ts';
import ObservationSupportCancelled from '../../domain/services/custody/ObservationSupportCancelled.ts';
import type ObservationSupportLimits from '../../domain/services/custody/ObservationSupportLimits.ts';
import ObservationSupportRefused from '../../domain/services/custody/ObservationSupportRefused.ts';
import type { ObservationSupportRequest } from '../../domain/services/custody/ObservationSupportRequest.ts';
import type CryptoPort from '../../ports/CryptoPort.ts';
import GitFastImportTreeScript from './GitFastImportTreeScript.ts';
import type GitFastImportTreeWriter from './GitFastImportTreeWriter.ts';
import type { GitTreeObjectEntry } from './GitTreeObjectEntry.ts';
import type ObservationWorkMeter from './ObservationWorkMeter.ts';

/** Dependency entries per page tree. */
export const OBSERVATION_DEPENDENCY_PAGE = 1024;
/** Page trees per attempt: custody evidence allows 64 supports, and the basis tree is one. */
export const OBSERVATION_DEPENDENCY_PAGES = 63;
const ENTRY_NAME_DIGITS = 8;

export type ObservationDependencyHistory = {
  nodeExists(oid: string): Promise<boolean>;
  readTreeObjectEntries(treeOid: string): Promise<readonly GitTreeObjectEntry[]>;
};

export type ObservationPageSet = { readonly pages: readonly string[]; readonly claim: ObservationDependencyClaim };
type WriteStop = ObservationSupportRefused | ObservationSupportCancelled;

/**
 * Retains dependency objects through bounded page trees, each a custody support.
 * Working memory holds one page, pages are content-addressed so a rebuilt attempt
 * reproduces the same supports, and the result must match the attempt's claim.
 */
export default class ObservationDependencyPages {
  readonly #history: ObservationDependencyHistory;
  readonly #trees: GitFastImportTreeWriter;
  readonly #crypto: CryptoPort;
  readonly #limits: ObservationSupportLimits;

  constructor(options: {
    readonly history: ObservationDependencyHistory;
    readonly trees: GitFastImportTreeWriter;
    readonly crypto: CryptoPort;
    readonly limits: ObservationSupportLimits;
  }) {
    this.#history = options.history;
    this.#trees = options.trees;
    this.#crypto = options.crypto;
    this.#limits = options.limits;
    Object.freeze(this);
  }

  async write(request: ObservationSupportRequest, meter: ObservationWorkMeter): Promise<ObservationPageSet | WriteStop> {
    const pages: string[] = [];
    let claim = ObservationDependencyClaim.NONE;
    let batch: ObservationDependency[] = [];
    for await (const dependency of request.dependencies) {
      const stopped = await this.#stopFor({ request, meter, dependency, count: claim.count + 1 });
      if (stopped !== null) {
        return stopped;
      }
      claim = await claim.extended(this.#crypto, dependency);
      batch.push(dependency);
      if (batch.length === OBSERVATION_DEPENDENCY_PAGE) {
        pages.push(await this.#writePage(batch));
        batch = [];
      }
    }
    return await this.#finished(request, { pages, claim }, batch);
  }

  /** The first problem with retained pages against their claim, or null. */
  async check(
    pages: readonly string[],
    claimed: ObservationDependencyClaim,
    meter: ObservationWorkMeter,
  ): Promise<'dependency-missing' | 'dependency-mismatch' | 'work-limit' | null> {
    let claim = ObservationDependencyClaim.NONE;
    for (const page of pages) {
      const entries = await this.#pageEntries(page, meter);
      if (typeof entries === 'string') {
        return entries;
      }
      claim = await this.#extendedBy(claim, entries);
    }
    return claim.equals(claimed) ? null : 'dependency-mismatch';
  }

  async #stopFor(step: {
    readonly request: ObservationSupportRequest;
    readonly meter: ObservationWorkMeter;
    readonly dependency: ObservationDependency;
    readonly count: number;
  }): Promise<WriteStop | null> {
    if (step.request.isCancelled()) {
      return new ObservationSupportCancelled();
    }
    if (step.count > Math.min(this.#limits.dependencies, OBSERVATION_DEPENDENCY_PAGE * OBSERVATION_DEPENDENCY_PAGES)) {
      return new ObservationSupportRefused('dependency-limit');
    }
    if (!step.meter.spend(1)) {
      return new ObservationSupportRefused('work-limit');
    }
    return await this.#history.nodeExists(step.dependency.oid) ? null : new ObservationSupportRefused('dependency-unavailable');
  }

  async #finished(
    request: ObservationSupportRequest,
    state: ObservationPageSet,
    batch: readonly ObservationDependency[],
  ): Promise<ObservationPageSet | WriteStop> {
    if (!state.claim.equals(request.claim)) {
      return new ObservationSupportRefused('dependency-mismatch');
    }
    return batch.length === 0 ? state : { ...state, pages: [...state.pages, await this.#writePage(batch)] };
  }

  /** One page tree of dependency edges. Its objects were just checked, so a failure here is a real store failure. */
  async #writePage(batch: readonly ObservationDependency[]): Promise<string> {
    const script = new GitFastImportTreeScript();
    batch.forEach((dependency, index) => placeEntry(script, dependency, index));
    return await this.#trees.write(script);
  }

  /** A page's dependency entries in order, or the reason they cannot be read. */
  async #pageEntries(
    oid: string,
    meter: ObservationWorkMeter,
  ): Promise<readonly GitTreeObjectEntry[] | 'dependency-missing' | 'work-limit'> {
    if (!meter.spend(1)) {
      return 'work-limit';
    }
    if (!await this.#history.nodeExists(oid)) {
      return 'dependency-missing';
    }
    const entries = [...await this.#history.readTreeObjectEntries(oid)]
      .sort((left, right) => left.name.localeCompare(right.name));
    return await this.#entriesExist(entries, meter) ?? entries;
  }

  async #entriesExist(entries: readonly GitTreeObjectEntry[], meter: ObservationWorkMeter): Promise<'dependency-missing' | 'work-limit' | null> {
    for (const entry of entries) {
      if (!meter.spend(1)) {
        return 'work-limit';
      }
      if (!await this.#history.nodeExists(entry.oid)) {
        return 'dependency-missing';
      }
    }
    return null;
  }

  async #extendedBy(claim: ObservationDependencyClaim, entries: readonly GitTreeObjectEntry[]): Promise<ObservationDependencyClaim> {
    let extended = claim;
    for (const entry of entries) {
      extended = await extended.extended(this.#crypto, { type: entryType(entry), oid: entry.oid });
    }
    return extended;
  }
}

function entryType(entry: GitTreeObjectEntry): 'blob' | 'tree' {
  return entry.type === 'tree' ? 'tree' : 'blob';
}

function placeEntry(script: GitFastImportTreeScript, dependency: ObservationDependency, index: number): void {
  const name = String(index).padStart(ENTRY_NAME_DIGITS, '0');
  if (dependency.type === 'tree') {
    script.graft(name, dependency.oid);
  } else {
    script.link(name, dependency.oid);
  }
}
