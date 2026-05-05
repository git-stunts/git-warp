/**
 * Coverage ratchet policy for Vitest threshold auto-updates.
 *
 * Targeted coverage runs (single files or ad hoc filters) can still be
 * reported by Vitest as "all tests run", which makes `thresholds.autoUpdate`
 * unsafe when enabled unconditionally. We gate threshold writes behind the
 * repository's explicit full-suite coverage command instead.
 */

/**
 * Returns true only when the caller has explicitly requested a full-suite
 * coverage ratchet update.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function shouldAutoUpdateCoverageRatchet(env = process.env) {
  return env['GIT_WARP_UPDATE_COVERAGE_RATCHET'] === '1';
}
