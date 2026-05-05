/**
 * BisectService — binary search over WARP graph history.
 *
 * Given a known-good commit SHA and a known-bad commit SHA on a writer's
 * patch chain, finds the first bad patch via binary search, calling a
 * user-supplied test function at each midpoint.
 *
 * @module domain/services/BisectService
 */

import type SnapshotWarpState from './snapshot/SnapshotWarpState.ts';

// -- Types --------------------------------------------------------------------

type PatchEntry = {
  readonly patch: { readonly lamport: number };
  readonly sha: string;
};

/** Port for the graph operations bisect needs. */
type BisectGraph = {
  readonly getWriterPatches: (writerId: string) => Promise<PatchEntry[]>;
  readonly materialize: (opts: { ceiling: number }) => Promise<SnapshotWarpState>;
};

type BisectFound = {
  readonly result: 'found';
  readonly firstBadPatch: string;
  readonly writerId: string;
  readonly lamport: number;
  readonly steps: number;
  readonly totalCandidates: number;
};

type BisectRangeError = {
  readonly result: 'range-error';
  readonly message: string;
};

type BisectResult = BisectFound | BisectRangeError;

type BisectTestFn = (state: SnapshotWarpState, sha: string) => Promise<boolean>;

type BisectRunOptions = {
  readonly good: string;
  readonly bad: string;
  readonly writerId: string;
  readonly testFn: BisectTestFn;
};

// -- Helpers ------------------------------------------------------------------

function rangeError(message: string): BisectRangeError {
  return { result: 'range-error', message };
}

function found(
  writerId: string,
  entry: PatchEntry,
  steps: number,
  totalCandidates: number,
): BisectFound {
  return {
    result: 'found',
    firstBadPatch: entry.sha,
    writerId,
    lamport: entry.patch.lamport,
    steps,
    totalCandidates,
  };
}

function resolveCandidates(
  patches: PatchEntry[],
  good: string,
  bad: string,
): { candidates: PatchEntry[] } | { error: string } {
  const goodIdx = patches.findIndex((p) => p.sha === good);
  const badIdx = patches.findIndex((p) => p.sha === bad);

  if (goodIdx === -1 || badIdx === -1) {
    return { error: 'good or bad SHA not found in writer chain' };
  }
  if (goodIdx >= badIdx) {
    return { error: 'good is not an ancestor of bad' };
  }
  return { candidates: patches.slice(goodIdx + 1, badIdx + 1) };
}

// -- Service ------------------------------------------------------------------

export default class BisectService {
  private readonly _graph: BisectGraph;

  constructor(deps: { graph: BisectGraph }) {
    this._graph = deps.graph;
  }

  /**
   * Runs bisect on a single writer's patch chain.
   *
   * Returns 'found' with the first bad patch, or 'range-error'
   * if the good/bad range is invalid.
   */
  async run(opts: BisectRunOptions): Promise<BisectResult> {
    if (opts.good === opts.bad) {
      return rangeError('good and bad SHAs are the same');
    }

    const patches = await this._graph.getWriterPatches(opts.writerId);
    const resolved = resolveCandidates(patches, opts.good, opts.bad);

    if ('error' in resolved) {
      return rangeError(resolved.error);
    }

    const { candidates } = resolved;

    if (candidates.length === 1) {
      return found(opts.writerId, candidates[0]!, 0, 1);
    }

    const search = await this._binarySearch(candidates, opts.testFn);
    return found(opts.writerId, candidates[search.index]!, search.steps, candidates.length);
  }

  private async _binarySearch(
    candidates: PatchEntry[],
    testFn: BisectTestFn,
  ): Promise<{ index: number; steps: number }> {
    let lo = 0;
    let hi = candidates.length - 1;
    let steps = 0;

    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      const candidate = candidates[mid];
      if (!candidate) {
        break;
      }
      steps++;

      const state = await this._graph.materialize({ ceiling: candidate.patch.lamport });
      const isGood = await testFn(state, candidate.sha);

      if (isGood) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }

    return { index: lo, steps };
  }
}

export type { BisectResult, BisectFound, BisectRangeError, BisectGraph, BisectTestFn, PatchEntry };
