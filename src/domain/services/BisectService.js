/**
 * BisectService — binary search over WARP graph history.
 *
 * Given a known-good commit SHA and a known-bad commit SHA on a writer's
 * patch chain, finds the first bad patch via binary search, calling a
 * user-supplied test function at each midpoint.
 *
 * @module domain/services/BisectService
 */

/**
 * @typedef {Object} BisectResult
 * @property {'found'|'range-error'} result
 * @property {string} [firstBadPatch] - SHA of first bad patch (only when result === 'found')
 * @property {string} [writerId] - Writer who authored the bad patch
 * @property {number} [lamport] - Lamport tick of the bad patch
 * @property {number} [steps] - Number of bisect steps performed
 * @property {number} [totalCandidates] - Initial candidate count
 * @property {string} [message] - Human-readable error message (only when result === 'range-error')
 */

/**
 * @typedef {Object} BisectTestFn
 * @property {(state: import('./JoinReducer.js').WarpStateV5, sha: string) => Promise<boolean>} testFn
 */

/**
 * Builds a "found" result from a candidate entry.
 *
 * @param {{writerId: string, entry: {sha: string, patch: {lamport: number}}, steps: number, totalCandidates: number}} opts
 * @returns {BisectResult}
 */
function foundResult({ writerId, entry, steps, totalCandidates }) {
  return {
    result: 'found',
    firstBadPatch: entry.sha,
    writerId,
    lamport: entry.patch.lamport,
    steps,
    totalCandidates,
  };
}

/**
 * Resolves the candidate slice between good and bad SHAs.
 *
 * @param {Array<{patch: {lamport: number}, sha: string}>} patches - Chronological patch chain
 * @param {string} good - Known-good SHA
 * @param {string} bad - Known-bad SHA
 * @returns {{candidates: Array<{patch: {lamport: number}, sha: string}>}|{error: string}}
 */
function resolveCandidates(patches, good, bad) {
  const goodIdx = patches.findIndex(p => p.sha === good);
  const badIdx = patches.findIndex(p => p.sha === bad);

  if (goodIdx === -1 || badIdx === -1) {
    return { error: 'good or bad SHA not found in writer chain' };
  }
  if (goodIdx >= badIdx) {
    return { error: 'good is not an ancestor of bad' };
  }

  const candidates = patches.slice(goodIdx + 1, badIdx + 1);
  if (candidates.length === 0) {
    return { error: 'no candidates between good and bad' };
  }
  return { candidates };
}

export default class BisectService {
  /**
   * @param {{ graph: import('../WarpGraph.js').default }} options
   */
  constructor({ graph }) {
    this._graph = graph;
  }

  /**
   * Runs bisect on a single writer's patch chain.
   *
   * @param {{ good: string, bad: string, writerId: string, testFn: (state: import('./JoinReducer.js').WarpStateV5, sha: string) => Promise<boolean> }} options
   *   - good: SHA of known-good commit
   *   - bad: SHA of known-bad commit
   *   - writerId: writer whose chain to bisect
   *   - testFn: async function returning true if state is "good", false if "bad"
   * @returns {Promise<BisectResult>}
   */
  async run({ good, bad, writerId, testFn }) {
    if (good === bad) {
      return { result: 'range-error', message: 'good and bad SHAs are the same' };
    }

    const patches = await this._graph.getWriterPatches(writerId);
    const resolved = resolveCandidates(patches, good, bad);

    if ('error' in resolved) {
      return { result: 'range-error', message: resolved.error };
    }

    const { candidates } = resolved;

    // Single candidate — it must be the first bad patch
    if (candidates.length === 1) {
      return foundResult({ writerId, entry: candidates[0], steps: 0, totalCandidates: 1 });
    }

    // Binary search over the candidate range
    const { index, steps } = await this._binarySearch(candidates, testFn);
    return foundResult({ writerId, entry: candidates[index], steps, totalCandidates: candidates.length });
  }

  /**
   * Performs binary search over candidates, materializing at each midpoint.
   *
   * @param {Array<{patch: {lamport: number}, sha: string}>} candidates
   * @param {(state: import('./JoinReducer.js').WarpStateV5, sha: string) => Promise<boolean>} testFn
   * @returns {Promise<{index: number, steps: number}>}
   * @private
   */
  async _binarySearch(candidates, testFn) {
    let lo = 0;
    let hi = candidates.length - 1;
    let steps = 0;

    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      const candidate = candidates[mid];
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
